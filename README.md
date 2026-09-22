# Tyrano Translator

Tyrano Translator 提供独立桌面浏览器和 Manifest V3 扩展两种运行方式。它在 TyranoScript 把剧情文字绘制到消息框之前调用 AI，并使用玩家自己的 API Key 实时翻译。项目只处理网页文字，不识别或翻译图片。

当前目标站点为 [novelgame.jp](https://novelgame.jp/)。扩展覆盖主站、站内 iframe 以及实际承载游戏的 `*.novelgame.jp` 子域。

## 功能

- 在 `text.start` 阶段拦截剧情文本，AI 返回后再交给 Tyrano 原生消息流程。
- 纯译文模式：译文覆盖日文，并沿用游戏的逐字动画、点击等待和自动播放。
- Ruby 对照模式：原文保留，译文显示在每段原文上方或下方。
- AI 自动提取并维护每个游戏独立的角色名、地名和专用词术语表。
- 本地缓存相同原文，减少重复请求和费用。
- 支持 OpenAI Responses API 以及实现相同 `/responses` 协议的兼容服务。
- 请求失败后自动恢复日文，不会永久阻塞剧情。

## 独立浏览器

独立浏览器内置 Chromium 与翻译后端，不需要另外安装扩展。它只允许访问 `novelgame.jp` 及其子域，并提供作品编号直达、前进、后退、刷新、主页和翻译设置。

在 Windows 上生成免安装目录：

```powershell
npm install
npm run browser:dir
```

程序位于 `release-browser/win-unpacked/Tyrano Translator Browser.exe`。生成安装程序：

```powershell
npm run browser:dist
```

安装包位于 `release-browser/Tyrano-Translator-Browser-0.3.1-Setup.exe`。首次运行后点击工具栏中的“翻译设置”，只需填写自己的 API Key。项目的构建命令不会自动启动浏览器；只有 `npm run browser:start` 会打开窗口。

## 扩展本地安装

1. 安装 Node.js 22.12 或更高版本。
2. 在项目目录运行 `npm run build`。
3. 打开 Chromium 系浏览器的扩展管理页并开启“开发者模式”。
4. 选择“加载已解压的扩展程序”，指向 `dist/tyrano-translator`。
5. 打开扩展设置，粘贴自己的 API Key 后保存。
6. 刷新已经打开的 Tyrano 游戏页面。

本项目不包含 API Key。

## 设置

首次使用通常只需填写 API Key。默认设置为：

- API：`https://api.openai.com/v1/responses`
- 模型：`gpt-5.6-luna`
- 目标语言：简体中文
- 显示模式：纯译文

高级选项允许修改模型、目标语言和 API 基础地址。兼容服务必须实现 Responses API 的结构化输出格式。

Ruby 模式使用浏览器原生 `<ruby>` 排版。译文通常比日文更长，个别游戏的窄消息框可能需要缩小游戏字体或切换为纯译文模式。

译文不使用扩展自带或远程字体。扩展优先保留 Tyrano 当前游戏字体，并依次追加苹方、微软雅黑、Noto/思源黑体和文泉驿作为中文字形回退；游戏字体缺少中文时，浏览器会自动选择本机可用的中文字体。Ruby 和降级译文也继承消息节点的字号、粗细与样式。

## 权限说明

- `storage`：在扩展本地存储设置、API Key、译文缓存和 AI 术语表。
- 页面脚本仅在 `novelgame.jp` 及其子域运行。
- `<all_urls>` 主机权限：允许扩展后台向玩家自行配置的 API 地址发送翻译请求；API Key 不会交给游戏页面。

扩展不会读取图片，也不会把 API Key 注入游戏页面。更完整的说明见 [`PRIVACY.md`](PRIVACY.md)。

## 故障排查

- 一直显示日文：确认已保存 API Key、实时翻译处于启用状态，然后刷新游戏页面。
- 提示 401：API Key 无效，或 Key 无权使用所选模型。
- 提示 404：API 基础地址应填写到版本目录，例如 `https://api.openai.com/v1`，不要自行追加 `/responses`。
- 提示 429：服务触发限流或余额不足；扩展会自动重试一次。
- Ruby 排版拥挤：改用纯译文模式，或选择较短的目标语言表达。
- 非标准引擎未提前翻译：扩展会退回 DOM 观察模式；Canvas 文本及图片文字不在支持范围内。

## 开发与验证

```powershell
npm install
npm run check
npm run browser:check
npm test
npm run build
npm run browser:dir
```

独立浏览器的手动验收步骤见 [`BROWSER_TESTING.md`](BROWSER_TESTING.md)。架构分析见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，目标站兼容性见 [`SITE_COMPATIBILITY.md`](SITE_COMPATIBILITY.md)，逐步开发记录见 [`DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md)。
