const fields = {
  enabled: document.querySelector("#enabled"),
  apiKey: document.querySelector("#api-key"),
  baseUrl: document.querySelector("#base-url"),
  model: document.querySelector("#model"),
  targetLanguage: document.querySelector("#target-language"),
  displayMode: document.querySelector("#display-mode"),
  rubyPosition: document.querySelector("#ruby-position")
};
const status = document.querySelector("#status");
const summary = document.querySelector("#summary");

function render(settings) {
  for (const [key, element] of Object.entries(fields)) {
    if (element.type === "checkbox") element.checked = settings[key];
    else element.value = settings[key];
  }
  fields.rubyPosition.disabled = fields.displayMode.value !== "ruby";
  summary.textContent = `已缓存 ${settings.cacheCount} 条译文；${settings.gameCount} 个游戏共有 ${settings.glossaryCount} 条 AI 术语。`;
}

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "正在保存…";
  status.dataset.kind = "";
  try {
    const settings = Object.fromEntries(
      Object.entries(fields).map(([key, element]) => [key, element.type === "checkbox" ? element.checked : element.value])
    );
    render(await window.tyranoBrowser.saveSettings(settings));
    status.textContent = "设置已保存";
    status.dataset.kind = "success";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.dataset.kind = "error";
  }
});

fields.displayMode.addEventListener("change", () => {
  fields.rubyPosition.disabled = fields.displayMode.value !== "ruby";
});
document.querySelector("#clear-cache").addEventListener("click", async () => render(await window.tyranoBrowser.clearCache()));
document.querySelector("#clear-glossaries").addEventListener("click", async () => render(await window.tyranoBrowser.clearGlossaries()));

window.tyranoBrowser.getSettings().then(render);

