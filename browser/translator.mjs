import {
  DEFAULT_SETTINGS,
  analyzeTranslation,
  buildTranslationRequest,
  contextFingerprint,
  fetchJsonWithRetry,
  findCachedTranslation,
  gameKeyFromUrl,
  mergeGlossary,
  normalizeBaseUrl,
  parseTranslationResponse,
  protectTextLayout,
  restoreTextLayout
} from "../src/background/translation-core.js";

const CACHE_LIMIT = 500;
const CONTEXT_LIMIT = 10;
const QUALITY_ATTEMPTS = 2;

export function sanitizeBrowserSettings(input, current = DEFAULT_SETTINGS) {
  const baseUrl = normalizeBaseUrl(input?.baseUrl ?? current.baseUrl);
  const url = new URL(baseUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error("API 地址必须使用 HTTP 或 HTTPS");

  const model = String(input?.model ?? current.model).trim();
  const targetLanguage = String(input?.targetLanguage ?? current.targetLanguage).trim();
  const apiKey = String(input?.apiKey ?? current.apiKey).trim();
  if (!model) throw new Error("模型不能为空");
  if (!targetLanguage) throw new Error("目标语言不能为空");

  return {
    enabled: input?.enabled !== false,
    apiKey,
    baseUrl,
    model,
    targetLanguage,
    displayMode: input?.displayMode === "ruby" ? "ruby" : "translation",
    rubyPosition: input?.rubyPosition === "under" ? "under" : "over"
  };
}

export class TranslationService {
  constructor(store, { fetchImpl = fetch } = {}) {
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.inFlight = new Map();
    this.contexts = new Map();
  }

  getSettingsSummary() {
    const data = this.store.read();
    const settings = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, data[key]]));
    return {
      ...settings,
      cacheCount: data.translationCache.length,
      problemCount: data.translationCache.filter((entry) => entry.problems?.length).length,
      glossaryCount: Object.values(data.glossaries).reduce((sum, entries) => sum + entries.length, 0),
      gameCount: Object.keys(data.glossaries).length
    };
  }

  async saveSettings(input) {
    const next = sanitizeBrowserSettings(input, this.store.read());
    await this.store.update((data) => ({ ...data, ...next }));
    return this.getSettingsSummary();
  }

  async clearCache() {
    await this.store.update((data) => ({ ...data, translationCache: [] }));
    return this.getSettingsSummary();
  }

  async clearGlossaries() {
    await this.store.update((data) => ({ ...data, glossaries: {} }));
    return this.getSettingsSummary();
  }

  async translate(payload) {
    const source = String(payload?.text ?? "");
    if (!source.trim() || source.length > 5000) throw new Error("没有有效的可翻译文本");
    const speaker = String(payload?.speaker ?? "").trim().slice(0, 120);
    const data = this.store.read();
    const settings = { ...DEFAULT_SETTINGS, ...data };
    if (!settings.enabled) throw new Error("翻译已暂停");
    if (!settings.apiKey) throw new Error("请先在翻译设置中填写 API Key");

    const gameKey = gameKeyFromUrl(payload?.pageUrl);
    const documentId = String(payload?.documentId ?? "default").slice(0, 120);
    const contextKey = `${gameKey}#${documentId}`;
    const context = this.contexts.get(contextKey) ?? [];
    const repeated = context.at(-1);
    if (repeated?.source === source && repeated?.speaker === speaker) {
      this.rememberContext(contextKey, repeated);
      return this.result(repeated.translation, settings, true, repeated.problems);
    }
    const query = {
      gameKey,
      source,
      speaker,
      contextFingerprint: contextFingerprint(context),
      model: settings.model,
      targetLanguage: settings.targetLanguage
    };
    const cached = findCachedTranslation(data.translationCache, query);
    if (cached) {
      this.rememberContext(contextKey, { speaker, source, translation: cached.translation, problems: cached.problems ?? [] });
      return this.result(cached.translation, settings, true, cached.problems);
    }

    const requestKey = JSON.stringify(query);
    if (this.inFlight.has(requestKey)) return this.inFlight.get(requestKey);
    const task = this.request({ source, speaker, gameKey, context, settings, query })
      .then((result) => {
        this.rememberContext(contextKey, { speaker, source, translation: result.translation, problems: result.problems ?? [] });
        return result;
      })
      .finally(() => this.inFlight.delete(requestKey));
    this.inFlight.set(requestKey, task);
    return task;
  }

  rememberContext(contextKey, entry) {
    const current = this.contexts.get(contextKey) ?? [];
    this.contexts.set(contextKey, [...current, entry].slice(-CONTEXT_LIMIT));
  }

  result(translation, settings, cached, problems = []) {
    return {
      translation,
      cached,
      displayMode: settings.displayMode,
      rubyPosition: settings.rubyPosition,
      problems,
      warning: problems?.length ? `译文质量检查：${problems.join("、")}` : ""
    };
  }

  async request({ source, speaker, gameKey, context, settings, query }) {
    const snapshot = this.store.read();
    const glossary = snapshot.glossaries[gameKey] ?? [];
    const layout = protectTextLayout(source);
    let translation = "";
    let rawTranslation = "";
    let glossaryUpdates = [];
    let problems = [];

    for (let attempt = 0; attempt < QUALITY_ATTEMPTS; attempt += 1) {
      const request = buildTranslationRequest({
        text: layout.text,
        speaker,
        context,
        settings,
        glossary,
        previousTranslation: rawTranslation,
        problems
      });
      const { response, data } = await fetchJsonWithRetry(
        request.endpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(request.body)
        },
        { fetchImpl: this.fetchImpl }
      );
      if (!response.ok) throw new Error(data?.error?.message || `AI 请求失败（HTTP ${response.status}）`);

      const parsed = parseTranslationResponse(data);
      rawTranslation = parsed.translation;
      glossaryUpdates = parsed.glossaryUpdates;
      translation = restoreTextLayout(rawTranslation, layout);
      problems = analyzeTranslation({
        source,
        rawTranslation,
        layout,
        targetLanguage: settings.targetLanguage
      });
      if (!problems.length) break;
    }

    await this.store.update((latest) => ({
      ...latest,
      translationCache: [
        ...latest.translationCache.filter(
          (entry) =>
            !(
              entry.source === query.source &&
              String(entry.gameKey ?? "") === query.gameKey &&
              String(entry.speaker ?? "") === query.speaker &&
              String(entry.contextFingerprint ?? "0:811c9dc5") === query.contextFingerprint &&
              entry.model === query.model &&
              entry.targetLanguage === query.targetLanguage
            )
        ),
        { ...query, rawTranslation, translation, problems, updatedAt: Date.now() }
      ].slice(-CACHE_LIMIT),
      glossaries: {
        ...latest.glossaries,
        [gameKey]: mergeGlossary(latest.glossaries[gameKey] ?? glossary, glossaryUpdates)
      }
    }));
    return this.result(translation, settings, false, problems);
  }
}

export function browserStoreDefaults() {
  return { ...DEFAULT_SETTINGS, translationCache: [], glossaries: {} };
}
