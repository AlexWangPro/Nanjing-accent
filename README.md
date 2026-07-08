# 南京 AI 语音助手 Fixed / Railway 超轻量版

这版修复了上一版可能出现的：

```text
Gemini returned empty text
```

核心修改：

- 文本对话改用稳定的 `models/{model}:generateContent` REST API
- 默认文本模型改为 `gemini-2.5-flash`
- 增强 Gemini 返回结构解析
- 增强错误提示：会显示 finishReason / blockReason，而不是只显示 empty text
- 仍然只有一个主要依赖：`express`
- 没有 Dockerfile、没有 React、没有 Vite、没有 @google/genai、没有 npm run build

## 文件结构

```text
public/
server.js
package.json
railway.json
README.md
.gitignore
```

## Railway Variables

必须添加：

```env
GEMINI_API_KEY=你的 Google AI Studio API Key
```

建议添加：

```env
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_VOICE=Kore
NODE_ENV=production
```

如果 `gemini-2.5-flash` 不可用，可以试：

```env
GEMINI_TEXT_MODEL=gemini-2.5-flash-lite
```

## 部署步骤

1. 新建 GitHub 仓库
2. 只上传本目录里的文件
3. Railway → New Project → Deploy from GitHub repo
4. 添加 Variables
5. 生成 Domain

## 正确的 Build Log 应该类似

```text
npm install --omit=dev --no-audit --no-fund
npm start
```

如果你看到以下内容，说明你还在部署旧仓库：

```text
Dockerfile
npm ci
npm run build
vite
@google/genai
```

## 测试接口

访问：

```text
/api/health
```

确认：

```json
{
  "ok": true,
  "hasGeminiKey": true,
  "textModel": "gemini-2.5-flash"
}
```

还可以访问：

```text
/api/models
```

它会列出你的 API Key 当前可用的模型，用来确认模型名是否可用。
