# Tyrano Translator

一个使用玩家自有 AI API Key，在浏览器中实时翻译 TyranoScript 游戏文本的 Manifest V3 扩展。

当前处于开发阶段。项目不会识别或翻译图片中的文字。

支持两种显示方式：

- 纯译文：在 Tyrano 绘制前替换日文，游戏消息框只显示译文。
- Ruby 对照：保留原文，并把译文显示在每段原文的上方或下方。

实现原理见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 开发检查

需要 Node.js 20 或更高版本：

```powershell
npm run check
npm test
```

详细进度见 [`DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md)。
