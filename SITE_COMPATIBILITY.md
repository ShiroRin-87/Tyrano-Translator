# novelgame.jp 兼容性记录

## 已检查实例

- 作品页：`https://novelgame.jp/games/show/3092`
- 站内播放入口：`https://novelgame.jp/games/play/3092`
- 实际游戏地址：`https://3092.sv02.novelgame.jp/game/3092/Game/`
- 检查日期：2026-09-22

作品页会用 `/games/play/{作品编号}` 创建 iframe。该入口随后跳转到 `{作品编号}.sv{分片}.novelgame.jp` 子域中的游戏目录，因此扩展必须同时注入主站和任意 `*.novelgame.jp` 子域、任意 iframe。

## 实例中的 Tyrano 结构

该实例是较旧的 Tyrano 版本，加载顺序包含：

- `tyrano/tyrano.js`
- `tyrano/tyrano.base.js`
- `tyrano/plugins/kag/kag.js`
- `tyrano/plugins/kag/kag.tag.js`

页面根节点仍为 `#tyrano_base.tyrano_base`。旧版的剧情执行链为：

1. `ftag.nextOrder()` 找到 `text` 标签。
2. 调用 `master_tag.text.start(pm)`。
3. `start` 把 `pm.val` 写入 `current_message_str` 并调用 `showMessage`。
4. `showMessage` 在 `.message_inner p .current_span` 中创建每字一个隐藏 span。
5. 内部 `pchar` 计时器逐个把字符设为可见，结束后调用 `nextOrder()`。

扩展在第 2 步之前等待 AI，因此纯译文可以完全阻止日文进入 DOM。Ruby 模式在第 4 步之后移动刚创建的外层 span；旧版 `pchar` 持有的是同一个 jQuery 节点引用，移动节点不会使逐字动画失效。

## 字体兼容

旧版 Tyrano 会先把 `config.userFace` 应用到 `.message_inner`，再把当前 `stat.font.face`、字号、粗体、斜体、阴影或描边应用到 `.current_span`。

- 纯译文仍由原生 `showMessage` 创建，所以沿用游戏字体与特效；本次文本 span 会在游戏字体之后追加中文系统字体回退。
- Ruby 的 `<ruby>`、`<rb>` 原文节点和 `<rt>` 译文都继承同一字体栈、粗细和样式。
- DOM 降级译文读取宿主节点的实际字体，再追加相同的中文系统字体回退。

回退顺序为苹方、微软雅黑、Noto/思源黑体、文泉驿和通用无衬线字体。字体文件由游戏页面或玩家操作系统提供；扩展不会下载、替换或上传字体。

## 静态检查边界

本记录通过 HTTPS 响应、HTML 和 JavaScript 源码完成，没有启动浏览器，也没有运行作品内容。真实页面上的视觉排版、跨版本插件冲突和 API 响应仍需在获得浏览器测试许可后验证。
