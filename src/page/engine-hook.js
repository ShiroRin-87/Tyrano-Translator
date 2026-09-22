(() => {
  const REQUEST_EVENT = "tyrano-translator:translate-request";
  const RESPONSE_EVENT = "tyrano-translator:translate-response";
  const READY_EVENT = "tyrano-translator:engine-ready";
  const HOOK_MARKER = Symbol("tyranoTranslatorHook");
  const REQUEST_TIMEOUT_MS = 60_000;
  const pending = new Map();
  const hookedTags = new WeakSet();
  let requestSequence = 0;

  function sanitizeForTyrano(text) {
    return text.replaceAll("<", "＜").replaceAll(">", "＞");
  }

  function wrapAsRuby(tag, translation, position) {
    const currentSpan = tag.kag?.getMessageCurrentSpan?.()?.get?.(0);
    const messageSpan = currentSpan?.lastElementChild;
    if (!messageSpan || messageSpan.matches("ruby[data-tyrano-translator-ruby]")) return;

    const ruby = document.createElement("ruby");
    const base = document.createElement("rb");
    const annotation = document.createElement("rt");
    ruby.dataset.tyranoTranslatorRuby = "";
    ruby.dataset.tyranoTranslatorPosition = position === "under" ? "under" : "over";
    annotation.textContent = translation;

    messageSpan.before(ruby);
    base.append(messageSpan);
    ruby.append(base, annotation);
  }

  function finishRequest(id, response) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timeout);

    const { originalStart, tag, pm } = entry;
    const translation = typeof response?.translation === "string" ? response.translation.trim() : "";
    if (!response?.ok || !translation) {
      originalStart.call(tag, pm);
      return;
    }

    if (response.displayMode === "ruby") {
      originalStart.call(tag, pm);
      wrapAsRuby(tag, translation, response.rubyPosition);
      return;
    }

    originalStart.call(tag, { ...pm, val: sanitizeForTyrano(translation) });
  }

  function hookTextTag(tag) {
    if (!tag || hookedTags.has(tag) || typeof tag.start !== "function") return false;
    const originalStart = tag.start;
    if (originalStart[HOOK_MARKER]) return false;

    function translatedStart(pm) {
      if (
        !pm?.val ||
        this.kag?.stat?.is_script === true ||
        this.kag?.stat?.is_html === true
      ) {
        return originalStart.call(this, pm);
      }

      const id = `${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
      const timeout = setTimeout(() => finishRequest(id, { ok: false }), REQUEST_TIMEOUT_MS);
      pending.set(id, { originalStart, tag: this, pm: { ...pm }, timeout });
      document.dispatchEvent(
        new CustomEvent(REQUEST_EVENT, {
          detail: { id, text: String(pm.val), pageUrl: location.href }
        })
      );
      return undefined;
    }

    translatedStart[HOOK_MARKER] = true;
    tag.start = translatedStart;
    hookedTags.add(tag);
    if (document.documentElement) {
      document.documentElement.dataset.tyranoTranslatorEngineHook = "active";
    }
    document.dispatchEvent(new CustomEvent(READY_EVENT));
    return true;
  }

  document.addEventListener(RESPONSE_EVENT, (event) => {
    const response = event.detail;
    if (!response || typeof response.id !== "string") return;
    finishRequest(response.id, response);
  });

  function discoverTags() {
    let found = false;
    found = hookTextTag(globalThis.tyrano?.plugin?.kag?.tag?.text) || found;
    found = hookTextTag(globalThis.TYRANO?.kag?.ftag?.master_tag?.text) || found;
    return found;
  }

  discoverTags();
  let discoveryAttempts = 0;
  const discoveryTimer = setInterval(() => {
    discoveryAttempts += 1;
    discoverTags();
    if (globalThis.TYRANO?.kag?.ftag?.master_tag?.text || discoveryAttempts >= 1200) {
      clearInterval(discoveryTimer);
    }
  }, 50);
})();
