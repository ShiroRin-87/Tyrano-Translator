const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  targetLanguage: "简体中文"
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TYRANO_TRANSLATOR_PING") return false;
  sendResponse({ ok: true });
  return false;
});

