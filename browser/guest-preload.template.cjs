const { ipcRenderer, webFrame } = require("electron");

const ENGINE_HOOK_SOURCE = __ENGINE_HOOK_SOURCE__;
const REQUEST_EVENT = "tyrano-translator:translate-request";
const RESPONSE_EVENT = "tyrano-translator:translate-response";
let lastNotice = "";

function showNotice(message) {
  const text = String(message ?? "").trim();
  if (!text || text === "翻译已暂停" || text === lastNotice) return;
  lastNotice = text;
  const mount = () => {
    let notice = document.querySelector("#tyrano-browser-translation-notice");
    if (!notice) {
      notice = document.createElement("aside");
      notice.id = "tyrano-browser-translation-notice";
      Object.assign(notice.style, {
        position: "fixed",
        zIndex: "2147483647",
        right: "16px",
        bottom: "16px",
        maxWidth: "420px",
        padding: "10px 14px",
        border: "1px solid rgba(248,113,113,.55)",
        borderRadius: "9px",
        background: "rgba(24,24,27,.94)",
        color: "#fecaca",
        font: "13px/1.5 system-ui,sans-serif",
        boxShadow: "0 8px 28px rgba(0,0,0,.35)"
      });
      document.documentElement.append(notice);
    }
    notice.textContent = `Tyrano Translator：${text}`;
    setTimeout(() => notice.remove(), 6000);
  };
  if (document.documentElement) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

document.addEventListener(REQUEST_EVENT, async (event) => {
  const detail = event.detail;
  if (!detail || typeof detail.id !== "string" || typeof detail.text !== "string") return;
  try {
    const result = await ipcRenderer.invoke("translator:translate", {
      text: detail.text,
      pageUrl: location.href
    });
    if (result?.error) showNotice(result.error);
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: {
        id: detail.id,
        ok: Boolean(result?.translation),
        translation: result?.translation,
        displayMode: result?.displayMode,
        rubyPosition: result?.rubyPosition,
        error: result?.error
      }
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showNotice(message);
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: { id: detail.id, ok: false, error: message }
    }));
  }
});

webFrame.executeJavaScript(ENGINE_HOOK_SOURCE, true).catch((error) => {
  showNotice(`引擎挂钩加载失败：${error.message}`);
});

