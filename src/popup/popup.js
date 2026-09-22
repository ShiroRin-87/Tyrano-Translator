const status = document.querySelector("#status");
const openOptions = document.querySelector("#open-options");
const enabled = document.querySelector("#enabled");

const settings = await chrome.storage.local.get(["enabled", "apiKey"]);
enabled.checked = settings.enabled !== false;
status.textContent = !settings.apiKey
  ? "尚未配置 API Key"
  : settings.enabled === false
    ? "翻译已暂停"
    : "翻译已启用";

enabled.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enabled.checked });
  status.textContent = enabled.checked ? "翻译已启用" : "翻译已暂停";
});

openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
