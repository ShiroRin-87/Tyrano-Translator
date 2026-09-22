(() => {
  const SPACE_PATTERN = /[\t\f\v ]+/g;
  const LINE_SPACE_PATTERN = / *\n */g;
  const INVISIBLE_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;
  const LETTER_PATTERN = /[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  const URL_PATTERN = /^(?:https?:\/\/|data:|blob:)/i;

  function normalizeText(value) {
    return String(value ?? "")
      .replace(INVISIBLE_PATTERN, "")
      .replace(/\r\n?/g, "\n")
      .replace(SPACE_PATTERN, " ")
      .replace(LINE_SPACE_PATTERN, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function shouldTranslate(value) {
    const text = normalizeText(value);
    if (!text || text.length > 5000 || URL_PATTERN.test(text)) return false;
    return LETTER_PATTERN.test(text);
  }

  globalThis.TyranoTextCore = Object.freeze({ normalizeText, shouldTranslate });
})();

