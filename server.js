import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
// 3.1 supports streaming and expressive tags. 2.5 flash preview tts is often available earlier.
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
// Kore is firm and can sound stiff. Achird/Sulafat/Callirrhoe are usually friendlier choices.
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Achird';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getStyleInstruction(mode = 'local') {
  const base = [
    '你是一个南京本土化AI语音助手。',
    '回答必须适合语音播放：短句、多停顿、自然聊天感。',
    '不要像新闻播音，不要像客服话术，不要堆砌方言。',
    '你的目标不是“纯方言表演”，而是“南京本地朋友在旁边跟你说话”。',
    '回答一般控制在 2 到 5 句话，除非用户要求详细解释。',
    '如果用户问现实信息、路线、票价、营业时间等可能变化的内容，请提醒用户以最新官方信息为准。'
  ].join('\n');

  if (mode === 'normal') {
    return `${base}\n模式：标准中文。自然友好，尽量口语化，不使用南京话。`;
  }

  if (mode === 'dialect') {
    return `${base}\n模式：轻南京话。普通话为骨架，南京本地说法更明显一些，但必须外地人也能听懂。\n可自然少量使用：阿是、蛮、来斯、稳当、不丑、今儿个、落雨、晓得、得空、莫慌、要得、搞搞看。\n注意：每次最多用 2 到 4 个南京表达，不能每句话都塞方言。`;
  }

  return `${base}\n模式：南京味普通话。普通话为主，像南京本地朋友一样说，偶尔带一点南京表达。\n可自然少量使用：蛮、稳当、不丑、今儿、晓得、莫慌、得空、要得。\n注意：每次最多用 1 到 3 个南京表达，保持自然。`;
}

function getTtsDirectorPrompt(text, mode = 'local') {
  const clean = String(text || '')
    .replace(/[*#>`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (mode === 'normal') {
    return [
      'Audio Profile: A warm, friendly Mandarin Chinese conversational assistant. Not a news anchor, not robotic, not overly formal.',
      'Scene: A relaxed one-on-one chat on a phone app.',
      'Director Notes: Speak naturally with gentle pauses, slightly slower than normal, clear but casual. Do not read these instructions aloud. Only perform the transcript.',
      `[warm, conversational, relaxed pace] ${clean}`
    ].join('\n');
  }

  if (mode === 'dialect') {
    return [
      'Audio Profile: A friendly local Nanjing speaker using Mandarin with a light Nanjing/Jianghuai local flavor. Warm, practical, down-to-earth.',
      'Scene: A Nanjing local friend talking casually, not performing dialect on stage.',
      'Director Notes: Keep Mandarin intelligible, but use relaxed Nanjing local rhythm, casual intonation, short pauses, and a little smile in the voice. Avoid announcer style and avoid robotic flatness. Do not read these instructions aloud. Only perform the transcript.',
      `[friendly, casual, natural Mandarin with subtle Nanjing local accent, relaxed pace] ${clean}`
    ].join('\n');
  }

  return [
    'Audio Profile: A warm Nanjing local friend speaking Mandarin with subtle local flavor. Friendly, everyday, practical, not exaggerated.',
    'Scene: A relaxed chat in Nanjing, like someone beside you giving a small suggestion.',
    'Director Notes: Speak naturally, with a little Nanjing local intonation, gentle pauses, and conversational warmth. Do not sound like a robot, news anchor, or formal customer service. Do not read these instructions aloud. Only perform the transcript.',
    `[warm, conversational, slight Nanjing local vibe, relaxed pace] ${clean}`
  ].join('\n');
}

function extractTextFromGenerateContent(data) {
  if (!data) return '';
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = [];

  for (const candidate of candidates) {
    const contentParts = candidate?.content?.parts;
    if (!Array.isArray(contentParts)) continue;
    for (const part of contentParts) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        parts.push(part.text.trim());
      }
    }
  }

  return parts.join('\n').trim();
}

function explainEmptyGeminiText(data) {
  const promptBlock = data?.promptFeedback?.blockReason;
  if (promptBlock) return `Gemini 没有返回文本，原因可能是 prompt 被拦截：${promptBlock}`;

  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const finishReasons = candidates.map(c => c?.finishReason).filter(Boolean);
  if (finishReasons.length) {
    return `Gemini 没有返回文本。finishReason: ${finishReasons.join(', ')}`;
  }

  if (data?.error?.message) return data.error.message;
  return 'Gemini 没有返回文本。请检查 GEMINI_TEXT_MODEL 是否可用，建议设置为 gemini-2.5-flash。';
}

function pcmToWavBase64(pcmBase64, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const pcm = Buffer.from(pcmBase64, 'base64');
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer.toString('base64');
}

async function callGeminiText(input, mode) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

  const model = GEMINI_TEXT_MODEL.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: getStyleInstruction(mode) }]
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `用户：${input}\n\n请直接给出回答，不要解释你的风格规则。`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: mode === 'normal' ? 0.75 : 0.95,
      topP: 0.95,
      maxOutputTokens: 520
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Gemini text request failed: ${response.status}`;
    throw new Error(message);
  }

  const text = extractTextFromGenerateContent(data);
  if (!text) {
    console.error('[gemini empty text raw]', JSON.stringify({
      promptFeedback: data?.promptFeedback,
      candidates: data?.candidates?.map(c => ({
        finishReason: c?.finishReason,
        safetyRatings: c?.safetyRatings,
        partCount: c?.content?.parts?.length || 0
      })),
      usageMetadata: data?.usageMetadata
    }, null, 2));
    throw new Error(explainEmptyGeminiText(data));
  }

  return text;
}

function extractPcmAudio(data) {
  // Interactions API
  if (data?.output_audio?.data) return data.output_audio.data;

  // Some API responses may expose events/steps. Keep this for resilience.
  const maybeEvents = Array.isArray(data?.events) ? data.events : [];
  for (const event of maybeEvents) {
    if (event?.delta?.type === 'audio' && event?.delta?.data) return event.delta.data;
    if (event?.output_audio?.data) return event.output_audio.data;
  }

  // GenerateContent-style shape, just in case Google routes it that way.
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part?.inlineData?.data) return part.inlineData.data;
    if (part?.inline_data?.data) return part.inline_data.data;
  }

  return '';
}

async function callGeminiTts(text, mode) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

  const prompt = getTtsDirectorPrompt(text, mode);

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'x-goog-api-key': GEMINI_API_KEY,
      'Content-Type': 'application/json',
      'Api-Revision': '2026-05-20'
    },
    body: JSON.stringify({
      model: GEMINI_TTS_MODEL,
      input: prompt,
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [{ voice: GEMINI_TTS_VOICE }]
      },
      store: false
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini TTS request failed: ${response.status}`;
    console.error('[tts api error]', { status: response.status, message, data });
    throw new Error(message);
  }

  const pcmBase64 = extractPcmAudio(data);
  if (!pcmBase64) {
    console.error('[tts empty audio raw]', JSON.stringify(data, null, 2).slice(0, 2000));
    throw new Error('Gemini returned empty audio');
  }
  return pcmToWavBase64(pcmBase64);
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'nanjing-gemini-nanjing-voice-v2',
    hasGeminiKey: Boolean(GEMINI_API_KEY),
    textModel: GEMINI_TEXT_MODEL,
    ttsModel: GEMINI_TTS_MODEL,
    ttsVoice: GEMINI_TTS_VOICE,
    node: process.version
  });
});

app.get('/api/models', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) return res.status(400).json({ error: 'Missing GEMINI_API_KEY' });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || `Models request failed: ${response.status}` });
    }
    const models = (data.models || []).map(m => ({
      name: m.name,
      displayName: m.displayName,
      supportedGenerationMethods: m.supportedGenerationMethods
    }));
    res.json({ models });
  } catch (error) {
    console.error('[models error]', error);
    res.status(500).json({ error: error.message || 'Models check failed' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const mode = String(req.body?.mode || 'local');
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const reply = await callGeminiText(message, mode);
    res.json({ reply, model: GEMINI_TEXT_MODEL });
  } catch (error) {
    console.error('[chat error]', error);
    res.status(500).json({ error: error.message || 'Chat failed' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const mode = String(req.body?.mode || 'local');
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const audioBase64 = await callGeminiTts(text, mode);
    res.json({ audioBase64, mimeType: 'audio/wav', engine: 'gemini', voice: GEMINI_TTS_VOICE, model: GEMINI_TTS_MODEL });
  } catch (error) {
    // This endpoint is optional. The front-end can fall back to browser speech synthesis,
    // but it now displays that fallback clearly so you know what you are hearing.
    console.error('[tts error]', error);
    res.status(500).json({ error: error.message || 'TTS failed' });
  }
});

app.get('/api/tts-test', async (req, res) => {
  try {
    const sample = '今儿个先试一下声音，听听这个南京味儿阿是自然一点。莫慌，我们一步一步调。';
    const audioBase64 = await callGeminiTts(sample, 'dialect');
    res.json({ ok: true, audioBase64, mimeType: 'audio/wav', engine: 'gemini', voice: GEMINI_TTS_VOICE, model: GEMINI_TTS_MODEL });
  } catch (error) {
    console.error('[tts-test error]', error);
    res.status(500).json({ ok: false, error: error.message || 'TTS test failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nanjing Gemini Voice V2 running on 0.0.0.0:${PORT}`);
});
