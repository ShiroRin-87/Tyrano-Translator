const status = document.querySelector("#status");
const openOptions = document.querySelector("#open-options");

const settings = await chrome.storage.local.get(["enabled", "apiKey"]);
status.textContent = !settings.apiKey
  ? "尚未配置 API Key"
  : settings.enabled === false
    ? "翻译已暂停"
    : "翻译已启用";

openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

