import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Achird';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function normalizeMode(mode = 'local') {
  return ['normal', 'local', 'dialect', 'deep'].includes(mode) ? mode : 'local';
}

function normalizeAccent(accent = 'strong') {
  return ['light', 'strong', 'old'].includes(accent) ? accent : 'strong';
}

function getDialectGuide(mode = 'local', accent = 'strong') {
  if (mode === 'normal') {
    return {
      name: '标准中文',
      intensity: '无南京话',
      maxLocalWords: 0,
      words: '',
      notes: '自然友好，使用标准中文，不要使用南京话。'
    };
  }

  if (mode === 'local' && accent === 'light') {
    return {
      name: '南京味普通话',
      intensity: '轻度南京口吻',
      maxLocalWords: 2,
      words: '蛮、稳当、不丑、今儿、晓得、莫慌、得空、要得',
      notes: '普通话为主，只轻轻带一点南京本地口吻。不要刻意表演方言。'
    };
  }

  if (mode === 'local') {
    return {
      name: '南京口音普通话',
      intensity: accent === 'old' ? '老南京口吻试验' : '明显南京味',
      maxLocalWords: accent === 'old' ? 5 : 4,
      words: '阿是、蛮、来斯、稳当、不丑、今儿个、落雨、晓得、得空、莫慌、要得、搞搞看、乖乖',
      notes: accent === 'old'
        ? '像老南京街坊聊天，表达更接地气，但仍保持清楚易懂。偶尔可以用“阿是”“乖乖”“来斯”，不要每句话都用。'
        : '像南京本地朋友说普通话，南京味明显一点，但不要变成夸张小品。'
    };
  }

  if (mode === 'dialect') {
    return {
      name: '轻南京话',
      intensity: accent === 'old' ? '老南京话增强' : '南京话增强',
      maxLocalWords: accent === 'old' ? 7 : 5,
      words: '阿是、蛮、来斯、稳当、不丑、今儿个、落雨、晓得、得空、莫慌、要得、搞搞看、乖乖、韶韶、这边厢',
      notes: '普通话骨架 + 南京本地短句。外地人要能听懂。多用短句、多停顿，不要写成难懂的方言文字。'
    };
  }

  return {
    name: '老南京试验模式',
    intensity: '最强南京口吻',
    maxLocalWords: 8,
    words: '阿是、蛮、来斯、稳当、不丑、今儿个、落雨、晓得、得空、莫慌、要得、搞搞看、乖乖、韶韶、甭急、得嘞',
    notes: '尽量像南京本地街坊，但必须可懂、自然、不油腻。不要长篇大论，不要为了方言牺牲信息准确。'
  };
}

function getStyleInstruction(mode = 'local', accent = 'strong') {
  const m = normalizeMode(mode);
  const a = normalizeAccent(accent);
  const guide = getDialectGuide(m, a);

  const base = [
    '你是一个南京本土化AI语音助手。',
    '回答必须适合语音播放：短句、多停顿、像真人聊天，不像书面文章。',
    '不要像新闻播音，不要像正式客服，不要堆砌方言。',
    '核心目标：像南京本地朋友在旁边跟用户说话。',
    '回答一般控制在 2 到 5 句话，除非用户要求详细解释。',
    '如果用户问现实信息、路线、票价、营业时间、政策、活动等可能变化的内容，请提醒用户以最新官方信息为准。'
  ].join('\n');

  return [
    base,
    `当前模式：${guide.name}`,
    `南京味强度：${guide.intensity}`,
    `可用南京表达：${guide.words || '无'}`,
    `使用限制：整段回答最多自然使用 ${guide.maxLocalWords} 个南京表达。`,
    `风格说明：${guide.notes}`,
    '严禁：为了像方言而胡乱造词；严禁：每句话都塞“阿是/蛮/要得”；严禁：四川、东北、广东、台湾腔。',
    '输出要求：只输出给用户听的回答，不要解释你的规则。'
  ].join('\n');
}

function cleanForSpeech(text) {
  return String(text || '')
    .replace(/[*#>`_~]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitedReplace(text, search, replacement, limit = 1) {
  let count = 0;
  return text.replace(search, (...args) => {
    if (count >= limit) return args[0];
    count += 1;
    return typeof replacement === 'function' ? replacement(...args) : replacement;
  });
}

function addGentlePauses(text) {
  return text
    .replace(/。/g, '。 ')
    .replace(/，/g, '， ')
    .replace(/！/g, '！ ')
    .replace(/？/g, '？ ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function makeNanjingSpeechScript(text, mode = 'local', accent = 'strong') {
  const m = normalizeMode(mode);
  const a = normalizeAccent(accent);
  let s = cleanForSpeech(text);
  if (!s) return s;
  if (m === 'normal') return addGentlePauses(s);

  const limit = a === 'light' ? 1 : a === 'strong' ? 2 : 3;

  s = limitedReplace(s, /今天/g, '今儿个', limit);
  s = limitedReplace(s, /明天/g, '明儿', limit);
  s = limitedReplace(s, /现在/g, '这会儿', limit);
  s = limitedReplace(s, /下雨/g, '落雨', limit);
  s = limitedReplace(s, /知道/g, '晓得', limit);
  s = limitedReplace(s, /可以/g, '要得', limit);
  s = limitedReplace(s, /不错/g, '不丑', limit);
  s = limitedReplace(s, /很好/g, '蛮好', limit);
  s = limitedReplace(s, /非常/g, '蛮', limit);
  s = limitedReplace(s, /很/g, '蛮', limit);
  s = limitedReplace(s, /有空/g, '得空', limit);
  s = limitedReplace(s, /不要急/g, '莫慌', limit);
  s = limitedReplace(s, /别着急/g, '莫慌', limit);
  s = limitedReplace(s, /稍等一下/g, '等一小会儿', limit);
  s = limitedReplace(s, /试一下/g, '试一下下', limit);
  s = limitedReplace(s, /看一下/g, '看一下下', limit);
  s = limitedReplace(s, /怎么办/g, '怎么搞', limit);
  s = limitedReplace(s, /什么/g, '啥', a === 'old' ? 2 : 1);

  // Add one natural local marker only if the sentence lacks local flavor.
  const hasLocalMarker = /(阿是|蛮|来斯|稳当|不丑|今儿|落雨|晓得|得空|莫慌|要得|搞搞看|乖乖)/.test(s);
  if (!hasLocalMarker && m !== 'normal') {
    if (a === 'light') s = `嗯，${s}`;
    if (a === 'strong') s = `嗯，这么说吧，${s}`;
    if (a === 'old') s = `乖乖，这么说吧，${s}`;
  }

  if (m === 'deep' || (m === 'dialect' && a === 'old')) {
    s = limitedReplace(s, /你觉得呢？?$/g, '你看阿是这么个理儿？', 1);
    if (!/[。！？]$/.test(s)) s += '。';
    if (!/(要得|莫慌|稳当)[。！？]?$/.test(s) && s.length < 90) s += ' 要得。';
  }

  return addGentlePauses(s);
}

function getTtsDirectorPrompt(text, mode = 'local', accent = 'strong') {
  const m = normalizeMode(mode);
  const a = normalizeAccent(accent);
  const script = makeNanjingSpeechScript(text, m, a);

  if (m === 'normal') {
    return [
      'Audio Profile: Warm, friendly Mandarin Chinese conversational assistant. Not a news anchor, not robotic, not overly formal.',
      'Director Notes: Speak naturally with gentle pauses, slightly relaxed pace, clear casual Mandarin. Do not read these instructions aloud. Only perform the transcript.',
      `[warm, conversational, relaxed pace] ${script}`
    ].join('\n');
  }

  const intensityLine = a === 'light'
    ? 'Use only a subtle Nanjing local flavor. Keep it very intelligible.'
    : a === 'strong'
      ? 'Use a clearly Nanjing/Jianghuai Mandarin local accent, but do not exaggerate or become theatrical.'
      : 'Use a warmer older-Nanjing street-neighbor feeling: down-to-earth, relaxed, lightly Jianghuai Mandarin, still intelligible.';

  return [
    'Audio Profile: A native-feeling Nanjing local friend speaking Mandarin with Nanjing/Jianghuai Mandarin flavor.',
    'Important Accent Boundary: Do NOT use Beijing erhua, Sichuan accent, Cantonese accent, Taiwanese accent, or news-anchor Mandarin.',
    intensityLine,
    'Director Notes: Relaxed syllable endings, softer retroflex sound, casual local rhythm, slightly smiling voice, short natural pauses. Speak like a real person beside the user, not like a robot or formal customer service.',
    'Do not read these instructions aloud. Only perform the transcript below.',
    `[native-feeling Nanjing-accented Mandarin, warm, casual, grounded, relaxed pace] ${script}`
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

async function callGeminiText(input, mode, accent) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

  const model = GEMINI_TEXT_MODEL.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const m = normalizeMode(mode);
  const a = normalizeAccent(accent);
  const temperature = m === 'normal' ? 0.75 : a === 'old' || m === 'deep' ? 1.05 : 0.95;

  const body = {
    systemInstruction: {
      parts: [{ text: getStyleInstruction(m, a) }]
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `用户：${input}\n\n请直接给出回答。要自然，不要解释你用了什么南京话。`
          }
        ]
      }
    ],
    generationConfig: {
      temperature,
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

function isLikelyBase64(value) {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (s.length < 80) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(s);
}

function getPartMime(part) {
  return part?.mime_type || part?.mimeType || part?.inlineData?.mimeType || part?.inline_data?.mime_type || '';
}

function getPartData(part) {
  return part?.data || part?.inlineData?.data || part?.inline_data?.data || '';
}

function parseAudioRate(mime = '') {
  const match = String(mime).match(/rate=(\d+)/i);
  if (match) return Number(match[1]);
  return 24000;
}

function extractPcmAudio(data) {
  const candidates = [];

  if (data?.output_audio?.data) {
    candidates.push({ data: data.output_audio.data, mime: data.output_audio.mime_type || data.output_audio.mimeType || 'audio/l16' });
  }

  if (Array.isArray(data?.steps)) {
    for (const step of data.steps) {
      const content = Array.isArray(step?.content) ? step.content : [];
      for (const part of content) {
        candidates.push({ data: getPartData(part), mime: getPartMime(part) });
      }
    }
  }

  const maybeEvents = Array.isArray(data?.events) ? data.events : [];
  for (const event of maybeEvents) {
    if (event?.delta?.type === 'audio' && event?.delta?.data) {
      candidates.push({ data: event.delta.data, mime: event.delta.mime_type || event.delta.mimeType || 'audio/l16' });
    }
    if (event?.output_audio?.data) {
      candidates.push({ data: event.output_audio.data, mime: event.output_audio.mime_type || event.output_audio.mimeType || 'audio/l16' });
    }
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    candidates.push({ data: getPartData(part), mime: getPartMime(part) });
  }

  for (const item of candidates) {
    const mime = String(item.mime || '').toLowerCase();
    const raw = String(item.data || '').trim();
    if (!isLikelyBase64(raw)) continue;
    if (mime && !mime.includes('audio') && !mime.includes('l16') && !mime.includes('pcm')) continue;
    return { pcmBase64: raw, sampleRate: parseAudioRate(mime), mime: item.mime || 'audio/l16' };
  }

  return { pcmBase64: '', sampleRate: 24000, mime: '' };
}

async function callGeminiTts(text, mode, accent) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

  const m = normalizeMode(mode);
  const a = normalizeAccent(accent);
  const prompt = getTtsDirectorPrompt(text, m, a);

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

  const audio = extractPcmAudio(data);
  if (!audio.pcmBase64) {
    console.error('[tts empty audio raw]', JSON.stringify({
      status: data?.status,
      outputAudio: Boolean(data?.output_audio?.data),
      stepCount: Array.isArray(data?.steps) ? data.steps.length : 0,
      stepContent: Array.isArray(data?.steps) ? data.steps.map(step => (step?.content || []).map(part => ({ mime: getPartMime(part), hasData: Boolean(getPartData(part)), dataLength: String(getPartData(part) || '').length }))) : [],
      rawPreview: JSON.stringify(data).slice(0, 1200)
    }, null, 2));
    throw new Error('Gemini returned audio response, but no readable audio data was found');
  }

  console.log('[tts audio ok]', { mime: audio.mime, sampleRate: audio.sampleRate, base64Length: audio.pcmBase64.length, mode: m, accent: a });
  return {
    audioBase64: pcmToWavBase64(audio.pcmBase64, audio.sampleRate),
    speechScript: makeNanjingSpeechScript(text, m, a)
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'nanjing-gemini-nanjing-voice-v4',
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
    const mode = normalizeMode(req.body?.mode || 'local');
    const accent = normalizeAccent(req.body?.accent || 'strong');
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const reply = await callGeminiText(message, mode, accent);
    res.json({ reply, model: GEMINI_TEXT_MODEL, mode, accent });
  } catch (error) {
    console.error('[chat error]', error);
    res.status(500).json({ error: error.message || 'Chat failed' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const mode = normalizeMode(req.body?.mode || 'local');
    const accent = normalizeAccent(req.body?.accent || 'strong');
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const result = await callGeminiTts(text, mode, accent);
    res.json({
      audioBase64: result.audioBase64,
      speechScript: result.speechScript,
      mimeType: 'audio/wav',
      engine: 'gemini',
      voice: GEMINI_TTS_VOICE,
      model: GEMINI_TTS_MODEL,
      mode,
      accent
    });
  } catch (error) {
    console.error('[tts error]', error);
    res.status(500).json({ error: error.message || 'TTS failed' });
  }
});

app.get('/api/tts-test', async (req, res) => {
  try {
    const mode = normalizeMode(req.query.mode || 'dialect');
    const accent = normalizeAccent(req.query.accent || 'strong');
    const sampleByAccent = {
      light: '今儿先试一下声音，听听这个南京味是不是自然一点。莫慌，我们一步一步调。',
      strong: '今儿个先试一下声音，听听这个南京味儿阿是自然一点。莫慌，这事儿我们慢慢搞，蛮稳当。',
      old: '乖乖，今儿个先试一下声音，听听这个南京口音阿是更像本地人。莫慌，咱们慢慢搞，蛮来斯。'
    };
    const result = await callGeminiTts(sampleByAccent[accent], mode, accent);
    res.json({ ok: true, audioBase64: result.audioBase64, speechScript: result.speechScript, mimeType: 'audio/wav', engine: 'gemini', voice: GEMINI_TTS_VOICE, model: GEMINI_TTS_MODEL, mode, accent });
  } catch (error) {
    console.error('[tts-test error]', error);
    res.status(500).json({ ok: false, error: error.message || 'TTS test failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nanjing Gemini Voice V4 running on 0.0.0.0:${PORT}`);
});
