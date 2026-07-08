import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Use the stable GenerateContent API for text. The previous UltraLite version used
// the new Interactions API for text, which can return a shape this app did not parse.
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

// TTS is still preview. If it fails, the browser automatically falls back to Web Speech.
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getStyleInstruction(mode = 'local') {
  const base = [
    '你是一个南京本土化AI语音助手。',
    '回答要简洁、自然、适合语音播放。',
    '不要堆砌方言，不要像表演。',
    '如果用户问现实信息、路线、票价、营业时间等可能变化的内容，请提醒用户以最新官方信息为准。'
  ].join('');

  if (mode === 'normal') {
    return `${base}\n使用自然标准中文回答，语气友好。`;
  }
  if (mode === 'dialect') {
    return `${base}\n使用轻南京话/南京本地口吻回答。可以自然使用少量表达，例如“蛮”“阿是”“稳当”“不丑”“今儿个”“落雨”等，但必须保证外地人也能基本听懂。`;
  }
  return `${base}\n使用“南京味普通话”回答：普通话为主，语气像南京本地朋友，偶尔使用南京本地表达。`;
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
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 700
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

async function callGeminiTts(text) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'x-goog-api-key': GEMINI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GEMINI_TTS_MODEL,
      input: `[calm, friendly, natural Mandarin with a subtle Nanjing local vibe] ${text}`,
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
    throw new Error(message);
  }

  const pcmBase64 = data?.output_audio?.data;
  if (!pcmBase64) throw new Error('Gemini returned empty audio');
  return pcmToWavBase64(pcmBase64);
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'nanjing-gemini-ultralite-fixed',
    hasGeminiKey: Boolean(GEMINI_API_KEY),
    textModel: GEMINI_TEXT_MODEL,
    ttsModel: GEMINI_TTS_MODEL,
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
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const audioBase64 = await callGeminiTts(text);
    res.json({ audioBase64, mimeType: 'audio/wav' });
  } catch (error) {
    // This endpoint is optional. The front-end falls back to browser speech synthesis.
    console.error('[tts error]', error);
    res.status(500).json({ error: error.message || 'TTS failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nanjing Gemini UltraLite Fixed running on 0.0.0.0:${PORT}`);
});
