const ROOT_SELECTOR = "#tyrano_base, .tyrano_base";

function detectTyrano() {
  return Boolean(document.querySelector(ROOT_SELECTOR));
}

if (detectTyrano()) {
  document.documentElement.dataset.tyranoTranslator = "detected";
}

