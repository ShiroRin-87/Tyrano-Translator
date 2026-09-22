# Tyrano 浏览器架构与翻译接入点

## Tyrano 的执行链

TyranoScript 浏览器版把游戏挂载在 `#tyrano_base.tyrano_base` 下。KAG 解析器把场景脚本转换成标签数组，由 `kag.ftag.nextOrder()` 逐项执行：

1. `nextOrder()` 递增 `current_order_index`，取得下一个标签。
2. 标签参数经过条件检查和实体替换。
3. 引擎调用 `master_tag[tag.name].start(...)`。
4. 普通剧情文字进入 `master_tag.text.start(pm)`。
5. `text.start` 设置 `current_message_str`，随后调用 `showMessage(pm.val, ...)`。
6. `showMessage` 把文字拆成逐字符 `<span class="char">`，加入当前 `.message_inner`，再由 `addChars` 执行逐字动画。
7. 文本显示完成后，引擎继续处理 `[l]`、`[p]`、自动播放、跳过及下一标签。

角色名通常由 `chara_ptext.start` 写入开发者用 `[chara_config ptext=...]` 指定的文本区域；vchat 模式则使用 `#vchat_base` 和 `.current_vchat`。

## 为什么在 `text.start` 拦截

仅观察 DOM 时，日文已经进入消息层，而且逐字动画会造成大量短句 API 请求。扩展改为在页面主执行环境包装真正执行的 `TYRANO.kag.ftag.master_tag.text.start`：

```text
场景 text 标签
    ↓
扩展暂停 text.start ──→ 隔离环境 ──→ 后台 AI / 缓存 / 术语表
    ↑                                      │
    └────────────── 译文结果 ──────────────┘
    ↓
交回 Tyrano 原生 showMessage / addChars
```

这样不会手动推进 `nextOrder()`，因此点击等待、自动播放、跳过、气泡、字体效果及消息层切换仍由 Tyrano 控制。请求失败或 60 秒超时会恢复显示原文，避免游戏永久卡住。

## 两种显示模式

- 纯译文：在调用原始 `text.start` 前把 `pm.val` 替换为译文。日文不会进入消息层，译文沿用游戏原生逐字效果，并进入 Tyrano 的当前消息和历史流程。
- Ruby 对照：先取得译文，再用原始 `pm.val` 绘制日文；扩展把本次新增的消息 span 包装为 `<ruby><rb>原文</rb><rt>译文</rt></ruby>`。`ruby-position` 控制译文位于原文上方或下方。

主执行环境不能直接访问扩展 API，所以页面挂钩和隔离内容脚本通过 DOM 自定义事件传递请求编号、原文、当前说话人及译文。API Key 始终只存在于扩展后台和 `chrome.storage.local`，不会发送到页面环境。

## GPP 风格实时翻译流水线

后台把每条消息规范为 `name + message`，将换行和制表符保护为 `<br>`、`<tab>`，再附加最近 10 句滚动上下文及实际命中的 AI 术语。AI 返回后先进行格式数量、空译文、原文复现和残留日文检查；问题句会携带问题类型及上次结果重试一次。最终恢复原始格式，把原始译文、成品译文和问题列表写入上下文感知缓存，再交回 Tyrano 绘制。详细映射见 [`GPP_WORKFLOW.md`](GPP_WORKFLOW.md)。

## 兼容与降级

扩展同时尝试挂钩标签注册源 `tyrano.plugin.kag.tag.text` 和初始化后的 `TYRANO.kag.ftag.master_tag.text`，覆盖脚本加载早晚差异。找不到标准标签对象时，MutationObserver 会继续识别 `.message_inner`、角色名和 vchat 文本作为降级方案。任何模式都只处理 DOM 文本，不扫描图片或执行 OCR。

## 源码依据

- [TyranoScript `kag.tag.js`](https://github.com/ShikemokuMK/tyranoscript/blob/master/tyrano/plugins/kag/kag.tag.js)：`ftag.init`、`nextOrder`、`text.start`、`showMessage` 和逐字消息 DOM。
- [TyranoScript `kag.js`](https://github.com/ShikemokuMK/tyranoscript/blob/master/tyrano/plugins/kag/kag.js)：消息层获取、当前 span 与角色名区域。
- [TyranoScript `kag.tag_ext.js`](https://github.com/ShikemokuMK/tyranoscript/blob/master/tyrano/plugins/kag/kag.tag_ext.js)：`chara_ptext` 的角色名写入和流程推进。
