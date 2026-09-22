import {
  DEFAULT_SETTINGS,
  analyzeTranslation,
  buildTranslationRequest,
  contextFingerprint,
  fetchJsonWithRetry,
  findCachedTranslation,
  gameKeyFromUrl,
  mergeGlossary,
  parseTranslationResponse,
  protectTextLayout,
  restoreTextLayout
} from "./translation-core.js";

const CACHE_LIMIT = 500;
const CONTEXT_LIMIT = 10;
const QUALITY_ATTEMPTS = 2;
const inFlight = new Map();
const translationContexts = new Map();
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
  const source = String(payload?.text ?? "");
  if (!source.trim()) throw new Error("没有可翻译的文本");
  const speaker = String(payload?.speaker ?? "").trim().slice(0, 120);

  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS))) };
  if (!settings.enabled) throw new Error("翻译已暂停");
  if (!settings.apiKey) throw new Error("请先在扩展设置中填写 API Key");

  const stored = await chrome.storage.local.get(["translationCache", "glossaries"]);
  const gameKey = gameKeyFromUrl(payload?.pageUrl);
  const contextKey = `${gameKey}#${String(payload?.documentId ?? "default").slice(0, 120)}`;
  const context = translationContexts.get(contextKey) ?? [];
  const repeated = context.at(-1);
  if (repeated?.source === source && repeated?.speaker === speaker) {
    rememberContext(contextKey, repeated);
    return {
      translation: repeated.translation,
      cached: true,
      displayMode: settings.displayMode,
      rubyPosition: settings.rubyPosition,
      problems: repeated.problems ?? [],
      warning: repeated.problems?.length ? `译文质量检查：${repeated.problems.join("、")}` : ""
    };
  }
  const cacheQuery = {
    gameKey,
    source,
    speaker,
    contextFingerprint: contextFingerprint(context),
    model: settings.model,
    targetLanguage: settings.targetLanguage
  };
  const cached = findCachedTranslation(stored.translationCache ?? [], cacheQuery);
  if (cached) {
    rememberContext(contextKey, { speaker, source, translation: cached.translation, problems: cached.problems ?? [] });
    return {
      translation: cached.translation,
      cached: true,
      displayMode: settings.displayMode,
      rubyPosition: settings.rubyPosition,
      problems: cached.problems ?? [],
      warning: cached.problems?.length ? `译文质量检查：${cached.problems.join("、")}` : ""
    };
  }

  const requestKey = JSON.stringify(cacheQuery);
  if (inFlight.has(requestKey)) return inFlight.get(requestKey);

  const task = requestTranslation({
    source,
    speaker,
    gameKey,
    context,
    contextKey,
    settings,
    glossaries: stored.glossaries ?? {},
    cacheQuery
  }).finally(() => inFlight.delete(requestKey));
  inFlight.set(requestKey, task);
  return task;
}

function rememberContext(contextKey, entry) {
  const current = translationContexts.get(contextKey) ?? [];
  translationContexts.set(contextKey, [...current, entry].slice(-CONTEXT_LIMIT));
}

async function requestTranslation({ source, speaker, gameKey, context, contextKey, settings, glossaries, cacheQuery }) {
  const glossary = glossaries[gameKey] ?? [];
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
    const { response, data } = await fetchJsonWithRetry(request.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request.body)
    });
    if (!response.ok) {
      throw new Error(data?.error?.message || `AI 请求失败（HTTP ${response.status}）`);
    }

    const parsed = parseTranslationResponse(data);
    rawTranslation = parsed.translation;
    glossaryUpdates = parsed.glossaryUpdates;
    translation = restoreTextLayout(rawTranslation, layout);
    problems = analyzeTranslation({ source, rawTranslation, layout, targetLanguage: settings.targetLanguage });
    if (!problems.length) break;
  }

  await updateStorage(({ translationCache, glossaries: latestGlossaries }) => ({
    translationCache: [
      ...translationCache.filter(
        (entry) =>
          !(
            entry.source === cacheQuery.source &&
            String(entry.gameKey ?? "") === cacheQuery.gameKey &&
            String(entry.speaker ?? "") === cacheQuery.speaker &&
            String(entry.contextFingerprint ?? "0:811c9dc5") === cacheQuery.contextFingerprint &&
            entry.model === cacheQuery.model &&
            entry.targetLanguage === cacheQuery.targetLanguage
          )
      ),
      { ...cacheQuery, rawTranslation, translation, problems, updatedAt: Date.now() }
    ].slice(-CACHE_LIMIT),
    glossaries: {
      ...latestGlossaries,
      [gameKey]: mergeGlossary(latestGlossaries[gameKey] ?? glossary, glossaryUpdates)
    }
  }));

  rememberContext(contextKey, { speaker, source, translation, problems });

  return {
    translation,
    cached: false,
    displayMode: settings.displayMode,
    rubyPosition: settings.rubyPosition,
    problems,
    warning: problems.length ? `译文质量检查：${problems.join("、")}` : ""
  };
}
