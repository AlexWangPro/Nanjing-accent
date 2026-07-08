# 南京 Gemini 语音助手 V3 - TTS 修复版

这版修复了 V2 中 Gemini TTS 已返回 `steps[].content[].mime_type = audio/l16` 和 `data`，但后端没有正确解析的问题。

## 这版修复了什么

- 支持解析 `output_audio.data`
- 支持解析 `steps[].content[].data`
- 支持解析 `mime_type: audio/l16`
- 自动把 Gemini raw PCM / Linear16 封装成浏览器可播放的 WAV
- `/api/health` 显示版本 `nanjing-gemini-nanjing-voice-v3`
- 成功生成音频时 Railway Logs 会显示 `[tts audio ok]`

## Railway Variables

```env
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_VOICE=Achird
NODE_ENV=production
```

如果 TTS 模型不可用，可以尝试：

```env
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
```

可试的声音：

```env
GEMINI_TTS_VOICE=Achird
GEMINI_TTS_VOICE=Sulafat
GEMINI_TTS_VOICE=Callirrhoe
GEMINI_TTS_VOICE=Aoede
GEMINI_TTS_VOICE=Puck
```

## 部署

新建 GitHub 仓库，根目录只保留：

```text
public/
server.js
package.json
railway.json
README.md
.gitignore
```

不要有：

```text
Dockerfile
vite.config.js
src/
client/
node_modules/
```

Railway 连接新仓库部署即可。

## 测试

1. 打开 `/api/health`，确认 app 是 `nanjing-gemini-nanjing-voice-v3`。
2. 页面点击“测试声音”。
3. Railway Logs 应该出现：

```text
[tts audio ok] { mime: 'audio/l16', sampleRate: 24000, base64Length: ... }
```

如果还有失败，把 `[tts error]` 和 `[tts empty audio raw]` 发回来。
