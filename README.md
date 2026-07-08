# 南京 AI 语音助手 V4 - 南京口音强化版

这是 Railway 可部署的超轻量版：Express + 静态前端 + Gemini REST API。

V4 重点：

- 保留 V3 的 Gemini TTS audio/l16 -> WAV 修复
- 新增“口音强度”：轻一点 / 来点南京味 / 老南京一点
- 新增“老南京试验”模式
- 新增 TTS 南京话脚本显示，方便你判断实际送给 TTS 的文本
- 增强 Gemini TTS 导演式 Prompt，明确要求 Nanjing / Jianghuai Mandarin 风格
- 无 Dockerfile，无 React，无 Vite，无 @google/genai，只有 express 一个依赖

## Railway Variables

```env
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_VOICE=Achird
NODE_ENV=production
```

如果 TTS 模型不可用，可以试：

```env
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
```

推荐声音：

```env
GEMINI_TTS_VOICE=Achird
GEMINI_TTS_VOICE=Sulafat
GEMINI_TTS_VOICE=Callirrhoe
GEMINI_TTS_VOICE=Aoede
GEMINI_TTS_VOICE=Puck
```

## 部署

1. 新建 GitHub 仓库
2. 只上传本项目文件：public/、server.js、package.json、railway.json、README.md、.gitignore
3. Railway New Project -> Deploy from GitHub Repo
4. 添加 Variables
5. Generate Domain
6. 打开网页，先点“检查后端”，再点“测试南京口音”

## 注意

Gemini TTS 是通用 TTS，不是南京本地人专属声库。V4 会尽量通过文本脚本和 TTS prompt 推出南京口音，但真正原生南京口音需要后续接声音克隆/微调 TTS，例如录南京本地人语音后接 CosyVoice、GPT-SoVITS 或独立 GPU TTS 服务。
