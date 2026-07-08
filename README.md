# 南京 Gemini 语音助手 · 声音增强版

这是一个 Railway 可部署的超轻量版本：Express + 静态页面 + Gemini REST API。

## 本版重点

- 仍然只有一个核心依赖：express
- 没有 Dockerfile
- 没有 React / Vite / @google/genai
- 强化南京本地化文本 Prompt
- 强化 Gemini TTS 导演式 Prompt
- 默认声音从 Kore 改为 Achird，避免过于生硬
- 页面会明确显示：正在播放 Gemini TTS，还是已回退浏览器朗读
- 新增“测试声音”按钮和 `/api/tts-test`

## Railway Variables

建议：

```env
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_VOICE=Achird
NODE_ENV=production
```

如果 `gemini-3.1-flash-tts-preview` 不可用，可以试：

```env
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
```

声音可试：

```env
GEMINI_TTS_VOICE=Sulafat
GEMINI_TTS_VOICE=Callirrhoe
GEMINI_TTS_VOICE=Achird
GEMINI_TTS_VOICE=Aoede
GEMINI_TTS_VOICE=Puck
```

## 部署文件

仓库根目录只保留：

```text
public/
server.js
package.json
railway.json
README.md
.gitignore
```

不要上传：

```text
Dockerfile
vite.config.js
src/
client/
node_modules/
package-lock.json
```

## 判断你听到的是不是 Gemini TTS

打开网页点击“测试声音”。

- 如果状态显示 `Gemini TTS 测试成功`，说明听到的是 Gemini TTS。
- 如果状态显示 `Gemini TTS 失败，已回退浏览器朗读`，说明听到的是浏览器机器人声音，需要看 Railway Logs 里的 `[tts error]`。

## 局限

Gemini TTS 可以控制语气、语速、风格和轻微口音，但它不是专门训练的南京方言 TTS。真正像南京本地人的声音，需要后期用南京本地人录音做专属 TTS/声音克隆。
