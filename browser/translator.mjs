import {
  DEFAULT_SETTINGS,
  buildTranslationRequest,
  fetchJsonWithRetry,
  findCachedTranslation,
  gameKeyFromUrl,
  mergeGlossary,
  normalizeBaseUrl,
  parseTranslationResponse
} from "../src/background/translation-core.js";

const CACHE_LIMIT = 500;

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
  }

  getSettingsSummary() {
    const data = this.store.read();
    const settings = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, data[key]]));
    return {
      ...settings,
      cacheCount: data.translationCache.length,
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
    const source = String(payload?.text ?? "").trim();
    if (!source || source.length > 5000) throw new Error("没有有效的可翻译文本");
    const data = this.store.read();
    const settings = { ...DEFAULT_SETTINGS, ...data };
    if (!settings.enabled) throw new Error("翻译已暂停");
    if (!settings.apiKey) throw new Error("请先在翻译设置中填写 API Key");

    const query = { source, model: settings.model, targetLanguage: settings.targetLanguage };
    const cached = findCachedTranslation(data.translationCache, query);
    if (cached) return this.result(cached.translation, settings, true);

    const requestKey = JSON.stringify(query);
    if (this.inFlight.has(requestKey)) return this.inFlight.get(requestKey);
    const task = this.request({ source, pageUrl: payload?.pageUrl, settings, query })
      .finally(() => this.inFlight.delete(requestKey));
    this.inFlight.set(requestKey, task);
    return task;
  }

  result(translation, settings, cached) {
    return {
      translation,
      cached,
      displayMode: settings.displayMode,
      rubyPosition: settings.rubyPosition
    };
  }

  async request({ source, pageUrl, settings, query }) {
    const snapshot = this.store.read();
    const gameKey = gameKeyFromUrl(pageUrl);
    const glossary = snapshot.glossaries[gameKey] ?? [];
    const request = buildTranslationRequest({ text: source, settings, glossary });
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

    const { translation, glossaryUpdates } = parseTranslationResponse(data);
    await this.store.update((latest) => ({
      ...latest,
      translationCache: [
        ...latest.translationCache.filter(
          (entry) =>
            !(entry.source === query.source && entry.model === query.model && entry.targetLanguage === query.targetLanguage)
        ),
        { ...query, translation, updatedAt: Date.now() }
      ].slice(-CACHE_LIMIT),
      glossaries: {
        ...latest.glossaries,
        [gameKey]: mergeGlossary(latest.glossaries[gameKey] ?? glossary, glossaryUpdates)
      }
    }));
    return this.result(translation, settings, false);
  }
}

export function browserStoreDefaults() {
  return { ...DEFAULT_SETTINGS, translationCache: [], glossaries: {} };
}

