import {
  DEFAULT_SETTINGS,
  buildTranslationRequest,
  findCachedTranslation,
  gameKeyFromUrl,
  mergeGlossary,
  parseTranslationResponse
} from "./translation-core.js";

const CACHE_LIMIT = 500;
const inFlight = new Map();
let storageQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TYRANO_TRANSLATOR_PING") {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type !== "TYRANO_TRANSLATE_TEXT") return false;

  translate(message.payload)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});

function updateStorage(mutator) {
  storageQueue = storageQueue.then(async () => {
    const stored = await chrome.storage.local.get(["translationCache", "glossaries"]);
    const next = mutator({
      translationCache: stored.translationCache ?? [],
      glossaries: stored.glossaries ?? {}
    });
    await chrome.storage.local.set(next);
  });
  return storageQueue;
}

async function translate(payload) {
  const source = String(payload?.text ?? "").trim();
  if (!source) throw new Error("没有可翻译的文本");

  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS))) };
  if (!settings.enabled) throw new Error("翻译已暂停");
  if (!settings.apiKey) throw new Error("请先在扩展设置中填写 API Key");

  const stored = await chrome.storage.local.get(["translationCache", "glossaries"]);
  const cacheQuery = { source, model: settings.model, targetLanguage: settings.targetLanguage };
  const cached = findCachedTranslation(stored.translationCache ?? [], cacheQuery);
  if (cached) {
    return {
      translation: cached.translation,
      cached: true,
      displayMode: settings.displayMode,
      rubyPosition: settings.rubyPosition
    };
  }

  const requestKey = JSON.stringify(cacheQuery);
  if (inFlight.has(requestKey)) return inFlight.get(requestKey);

  const task = requestTranslation({
    source,
    settings,
    pageUrl: payload?.pageUrl,
    glossaries: stored.glossaries ?? {},
    cacheQuery
  }).finally(() => inFlight.delete(requestKey));
  inFlight.set(requestKey, task);
  return task;
}

async function requestTranslation({ source, settings, pageUrl, glossaries, cacheQuery }) {
  const gameKey = gameKeyFromUrl(pageUrl);
  const glossary = glossaries[gameKey] ?? [];
  const request = buildTranslationRequest({ text: source, settings, glossary });
  const response = await fetch(request.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request.body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `AI 请求失败（HTTP ${response.status}）`);
  }

  const { translation, glossaryUpdates } = parseTranslationResponse(data);
  await updateStorage(({ translationCache, glossaries: latestGlossaries }) => ({
    translationCache: [
      ...translationCache.filter(
        (entry) =>
          !(
            entry.source === cacheQuery.source &&
            entry.model === cacheQuery.model &&
            entry.targetLanguage === cacheQuery.targetLanguage
          )
      ),
      { ...cacheQuery, translation, updatedAt: Date.now() }
    ].slice(-CACHE_LIMIT),
    glossaries: {
      ...latestGlossaries,
      [gameKey]: mergeGlossary(latestGlossaries[gameKey] ?? glossary, glossaryUpdates)
    }
  }));

  return {
    translation,
    cached: false,
    displayMode: settings.displayMode,
    rubyPosition: settings.rubyPosition
  };
}
