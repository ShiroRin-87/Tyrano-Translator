const address = document.querySelector("#address");
const back = document.querySelector("#back");
const forward = document.querySelector("#forward");
const loading = document.querySelector("#loading");

function renderState(state) {
  if (!state) return;
  if (document.activeElement !== address) address.value = state.url;
  back.disabled = !state.canGoBack;
  forward.disabled = !state.canGoForward;
  loading.textContent = state.loading ? "加载中…" : "";
  document.title = state.title ? `${state.title} — Tyrano Translator` : "Tyrano Translator Browser";
}

document.querySelector("#address-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await window.tyranoBrowser.navigate(address.value);
  } catch (error) {
    loading.textContent = error instanceof Error ? error.message : String(error);
  }
});

back.addEventListener("click", () => window.tyranoBrowser.back());
forward.addEventListener("click", () => window.tyranoBrowser.forward());
document.querySelector("#reload").addEventListener("click", () => window.tyranoBrowser.reload());
document.querySelector("#home").addEventListener("click", () => window.tyranoBrowser.home());
document.querySelector("#settings").addEventListener("click", () => window.tyranoBrowser.openSettings());

window.tyranoBrowser.onState(renderState);
window.tyranoBrowser.getState().then(renderState);

