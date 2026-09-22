(() => {
  const REQUEST_EVENT = "tyrano-translator:translate-request";
  const RESPONSE_EVENT = "tyrano-translator:translate-response";
  const READY_EVENT = "tyrano-translator:engine-ready";
  const ROOT_SELECTOR = "#tyrano_base, .tyrano_base";
  const TEXT_SELECTOR = [
    ".message_inner",
    ".chara_name_area",
    ".chara_name",
    ".vchat-text",
    ".vchat-name",
    ".fuki_box .text"
  ].join(", ");
  const OUTPUT_ATTRIBUTE = "data-tyrano-translator-output";
  const SETTLE_DELAY_MS = 180;
  const CHINESE_FONT_FALLBACK = [
    '"PingFang SC"',
    '"Microsoft YaHei UI"',
    '"Microsoft YaHei"',
    '"Noto Sans CJK SC"',
    '"Source Han Sans SC"',
    '"WenQuanYi Micro Hei"',
    "sans-serif"
  ].join(", ");
  const timers = new WeakMap();
  const requestVersions = new WeakMap();
  const { normalizeText, shouldTranslate } = globalThis.TyranoTextCore;
  let engineHookActive = document.documentElement.dataset.tyranoTranslatorEngineHook === "active";
  let lastNotice = "";

  function showNotice(message) {
    const text = normalizeText(message);
    if (!text || text === "翻译已暂停" || text === lastNotice) return;
    lastNotice = text;
    let notice = document.querySelector("#tyrano-translator-notice");
    if (!notice) {
      notice = document.createElement("aside");
      notice.id = "tyrano-translator-notice";
      notice.setAttribute("role", "status");
      document.documentElement.append(notice);
    }
    notice.textContent = `Tyrano Translator：${text}`;
    notice.dataset.visible = "true";
    setTimeout(() => {
      notice.dataset.visible = "false";
    }, 6000);
  }

  document.addEventListener(READY_EVENT, () => {
    engineHookActive = true;
    document.documentElement.dataset.tyranoTranslatorEngineHook = "active";
  });

  document.addEventListener(REQUEST_EVENT, async (event) => {
    const detail = event.detail;
    if (
      !detail ||
      typeof detail.id !== "string" ||
      typeof detail.text !== "string" ||
      !shouldTranslate(detail.text) ||
      !document.querySelector(ROOT_SELECTOR)
    ) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "TYRANO_TRANSLATE_TEXT",
        payload: { text: detail.text, pageUrl: detail.pageUrl }
      });
      if (response?.error) showNotice(response.error);
      document.dispatchEvent(
        new CustomEvent(RESPONSE_EVENT, {
          detail: {
            id: detail.id,
            ok: Boolean(response?.translation),
            translation: response?.translation,
            displayMode: response?.displayMode,
            rubyPosition: response?.rubyPosition,
            error: response?.error
          }
        })
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
      document.dispatchEvent(
        new CustomEvent(RESPONSE_EVENT, {
          detail: { id: detail.id, ok: false, error: error instanceof Error ? error.message : String(error) }
        })
      );
    }
  });

  function sourceText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll(`[${OUTPUT_ATTRIBUTE}]`).forEach((output) => output.remove());
    return normalizeText(clone.textContent);
  }

  function applyChineseFontFallback(target, styleSource = target) {
    const gameFont = getComputedStyle(styleSource).fontFamily?.trim();
    target.style.fontFamily = gameFont
      ? `${gameFont}, ${CHINESE_FONT_FALLBACK}`
      : CHINESE_FONT_FALLBACK;
  }

  async function renderTranslation(element, source, translation) {
    if (sourceText(element) !== source) return;

    const { displayMode = "translation", rubyPosition = "over" } = await chrome.storage.local.get([
      "displayMode",
      "rubyPosition"
    ]);

    if (displayMode === "translation") {
      element.textContent = normalizeText(translation);
      applyChineseFontFallback(element);
      element.dataset.tyranoTranslatorSource = source;
      element.dataset.tyranoTranslatorRendered = normalizeText(translation);
      element.dataset.tyranoTranslatorState = "translated";
      return;
    }

    let output = element.querySelector(`:scope > [${OUTPUT_ATTRIBUTE}]`);
    if (!output) {
      output = document.createElement("div");
      output.setAttribute(OUTPUT_ATTRIBUTE, "");
      output.setAttribute("aria-label", "AI 翻译");
      element.append(output);
    }
    output.textContent = normalizeText(translation);
    applyChineseFontFallback(output, element);
    output.dataset.position = rubyPosition === "under" ? "under" : "over";
    element.dataset.tyranoTranslatorSource = source;
  }

  async function translateElement(element) {
    if (!element.isConnected) return;
    const source = sourceText(element);
    if (
      !shouldTranslate(source) ||
      element.dataset.tyranoTranslatorSource === source ||
      element.dataset.tyranoTranslatorRendered === source
    ) {
      return;
    }

    const version = (requestVersions.get(element) ?? 0) + 1;
    requestVersions.set(element, version);
    element.dataset.tyranoTranslatorState = "pending";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "TYRANO_TRANSLATE_TEXT",
        payload: { text: source, pageUrl: location.href }
      });

      if (requestVersions.get(element) !== version) return;
      if (response?.error) throw new Error(response.error);
      if (!response?.translation) throw new Error("翻译服务没有返回译文");
      await renderTranslation(element, source, response.translation);
      element.dataset.tyranoTranslatorState = "translated";
    } catch (error) {
      element.dataset.tyranoTranslatorState = "error";
      showNotice(error instanceof Error ? error.message : String(error));
      console.warn("[Tyrano Translator] Translation request failed", error);
    }
  }

  function schedule(element) {
    if (!(element instanceof Element) || !element.matches(TEXT_SELECTOR)) return;
    if (
      engineHookActive &&
      element.matches(".message_inner, .vchat-text, .fuki_box .text")
    ) {
      return;
    }
    clearTimeout(timers.get(element));
    timers.set(element, setTimeout(() => translateElement(element), SETTLE_DELAY_MS));
  }

  function candidatesFromNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (parent?.closest(`[${OUTPUT_ATTRIBUTE}]`)) return [];
      const candidate = parent?.closest(TEXT_SELECTOR);
      return candidate ? [candidate] : [];
    }
    if (!(node instanceof Element) || node.closest(`[${OUTPUT_ATTRIBUTE}]`)) return [];

    const candidates = [];
    if (node.matches(TEXT_SELECTOR)) candidates.push(node);
    const parentCandidate = node.closest(TEXT_SELECTOR);
    if (parentCandidate) candidates.push(parentCandidate);
    candidates.push(...node.querySelectorAll(TEXT_SELECTOR));
    return [...new Set(candidates)];
  }

  function start(root) {
    document.documentElement.dataset.tyranoTranslator = "detected";
    root.querySelectorAll(TEXT_SELECTOR).forEach(schedule);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          candidatesFromNode(mutation.target).forEach(schedule);
          continue;
        }
        mutation.addedNodes.forEach((node) => candidatesFromNode(node).forEach(schedule));
      }
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
  }

  const root = document.querySelector(ROOT_SELECTOR);
  if (root) {
    start(root);
  } else {
    const rootObserver = new MutationObserver(() => {
      const createdRoot = document.querySelector(ROOT_SELECTOR);
      if (!createdRoot) return;
      rootObserver.disconnect();
      start(createdRoot);
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
