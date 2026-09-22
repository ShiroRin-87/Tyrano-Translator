import { DEFAULT_SETTINGS, normalizeBaseUrl } from "../background/translation-core.js";

const form = document.querySelector("#settings-form");
const enabledInput = document.querySelector("#enabled");
const apiKeyInput = document.querySelector("#api-key");
const baseUrlInput = document.querySelector("#base-url");
const modelInput = document.querySelector("#model");
const targetLanguageInput = document.querySelector("#target-language");
const displayModeInput = document.querySelector("#display-mode");
const rubyPositionInput = document.querySelector("#ruby-position");
const saveStatus = document.querySelector("#save-status");
const storageSummary = document.querySelector("#storage-summary");

async function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS))) };
  enabledInput.checked = settings.enabled;
  apiKeyInput.value = settings.apiKey;
  baseUrlInput.value = settings.baseUrl;
  modelInput.value = settings.model;
  targetLanguageInput.value = settings.targetLanguage;
  displayModeInput.value = settings.displayMode;
  rubyPositionInput.value = settings.rubyPosition;
  updateRubyControls();
}

function updateRubyControls() {
  rubyPositionInput.disabled = displayModeInput.value !== "ruby";
}

async function updateStorageSummary() {
  const { translationCache = [], glossaries = {} } = await chrome.storage.local.get([
    "translationCache",
    "glossaries"
  ]);
  const termCount = Object.values(glossaries).reduce((sum, entries) => sum + entries.length, 0);
  storageSummary.textContent = `已缓存 ${translationCache.length} 条译文；${Object.keys(glossaries).length} 个游戏共有 ${termCount} 条 AI 术语。`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveStatus.textContent = "正在保存…";
  saveStatus.dataset.kind = "";

  try {
    const baseUrl = normalizeBaseUrl(baseUrlInput.value);
    const parsedUrl = new URL(baseUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("API 地址必须使用 HTTP 或 HTTPS");

    await chrome.storage.local.set({
      enabled: enabledInput.checked,
      apiKey: apiKeyInput.value.trim(),
      baseUrl,
      model: modelInput.value.trim(),
      targetLanguage: targetLanguageInput.value.trim(),
      displayMode: displayModeInput.value,
      rubyPosition: rubyPositionInput.value
    });
    baseUrlInput.value = baseUrl;
    saveStatus.textContent = "设置已保存在本机";
    saveStatus.dataset.kind = "success";
  } catch (error) {
    saveStatus.textContent = error instanceof Error ? error.message : String(error);
    saveStatus.dataset.kind = "error";
  }
});

displayModeInput.addEventListener("change", updateRubyControls);

document.querySelector("#clear-cache").addEventListener("click", async () => {
  await chrome.storage.local.set({ translationCache: [] });
  await updateStorageSummary();
});

document.querySelector("#clear-glossaries").addEventListener("click", async () => {
  await chrome.storage.local.set({ glossaries: {} });
  await updateStorageSummary();
});

await Promise.all([loadSettings(), updateStorageSummary()]);
