export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.6-luna",
  targetLanguage: "简体中文",
  displayMode: "translation",
  rubyPosition: "over"
});

const RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    translation: { type: "string" },
    glossary_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          note: { type: "string" }
        },
        required: ["source", "target", "note"]
      }
    }
  },
  required: ["translation", "glossary_updates"]
});

export function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_SETTINGS.baseUrl).trim().replace(/\/+$/, "");
}

export function gameKeyFromUrl(pageUrl) {
  try {
    return new URL(".", pageUrl).href;
  } catch {
    return "unknown-game";
  }
}

export function protectTextLayout(value) {
  const lineBreaks = [];
  let tabCount = 0;
  const text = String(value ?? "").replace(/\r\n|\r|\n|\t/g, (token) => {
    if (token === "\t") {
      tabCount += 1;
      return "<tab>";
    }
    lineBreaks.push(token);
    return "<br>";
  });
  return { text, lineBreaks, tabCount };
}

export function restoreTextLayout(value, layout) {
  let lineBreakIndex = 0;
  return String(value ?? "").replace(/<br\s*\/?\s*>|<tab>/gi, (token) => {
    if (/^<tab>$/i.test(token)) {
      return "\t";
    }
    const restored = layout.lineBreaks[lineBreakIndex] ?? "\n";
    lineBreakIndex += 1;
    return restored;
  });
}

export function selectRelevantGlossary(text, glossary = [], context = [], limit = 40) {
  const searchable = [
    String(text ?? ""),
    ...context.flatMap((entry) => [String(entry?.speaker ?? ""), String(entry?.source ?? "")])
  ].join("\n");
  return glossary
    .filter((entry) => entry?.source && searchable.includes(entry.source))
    .slice(-limit);
}

export function contextFingerprint(context = []) {
  const value = context
    .map((entry) => `${entry?.speaker ?? ""}\u241f${entry?.source ?? ""}`)
    .join("\u241e");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function analyzeTranslation({ source, rawTranslation, layout, targetLanguage }) {
  const problems = [];
  const raw = String(rawTranslation ?? "");
  const translatedBreakCount = (raw.match(/<br\s*\/?\s*>/gi) ?? []).length;
  const translatedTabCount = (raw.match(/<tab>/gi) ?? []).length;
  if (translatedBreakCount !== layout.lineBreaks.length) problems.push("换行数量不一致");
  if (translatedTabCount !== layout.tabCount) problems.push("制表符数量不一致");

  const restored = restoreTextLayout(raw, layout).trim();
  if (!restored) problems.push("译文为空");
  if (restored === String(source).trim()) problems.push("译文与原文相同");
  const japaneseTarget = /日本語|日语|japanese/i.test(String(targetLanguage ?? ""));
  if (!japaneseTarget && /[\u3040-\u30ff]/u.test(restored)) problems.push("残留日文");
  return [...new Set(problems)];
}

export function buildTranslationRequest({
  text,
  speaker = "",
  context = [],
  settings,
  glossary = [],
  previousTranslation = "",
  problems = []
}) {
  const relevantGlossary = selectRelevantGlossary(`${speaker}\n${text}`, glossary, context);
  const glossaryText = relevantGlossary.length
    ? relevantGlossary.map(({ source, target, note }) => `${source} => ${target}${note ? ` (${note})` : ""}`).join("\n")
    : "（尚无术语）";
  const recentContext = context.slice(-10).map((entry) => ({
    name: String(entry?.speaker ?? "").slice(0, 120),
    source: String(entry?.source ?? "").slice(0, 800),
    translation: String(entry?.translation ?? "").slice(0, 800)
  }));
  const correction = problems.length
    ? `上次译文存在以下问题：${problems.join("、")}。请修正后重新翻译。上次译文：${previousTranslation}`
    : "";

  return {
    endpoint: `${normalizeBaseUrl(settings.baseUrl)}/responses`,
    body: {
      model: settings.model,
      store: false,
      max_output_tokens: 1000,
      reasoning: { effort: "none" },
      instructions: [
        "你是视觉小说的专业本地化译者。",
        `把输入的游戏文本翻译为${settings.targetLanguage}。`,
        "只翻译 message，不解释、不审查、不续写；name 是说话人，仅用于判断语气和称谓。",
        "必须原样保留 message 中每一个 <br> 和 <tab> 标记及其顺序；保留语气、称谓和标点风格。",
        "previous_context 是已经完成的前文，只用于理解上下文，不要再次翻译或输出前文。",
        "必须优先遵循命中的术语表。识别值得长期保持一致的人名、地名、组织名或专用词，并在 glossary_updates 中给出新增或修订术语。",
        "不要把普通句子、标点或整段对白加入术语表。",
        `本句命中的术语表：\n${glossaryText}`,
        correction
      ].filter(Boolean).join("\n"),
      input: JSON.stringify({
        name: String(speaker ?? "").slice(0, 120),
        message: String(text ?? ""),
        previous_context: recentContext
      }),
      text: {
        format: {
          type: "json_schema",
          name: "tyrano_translation",
          strict: true,
          schema: RESPONSE_SCHEMA
        }
      }
    }
  };
}

export function extractResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  for (const item of response?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new Error("AI 响应中没有文本结果");
}

export function parseTranslationResponse(response) {
  const parsed = JSON.parse(extractResponseText(response));
  const translation = String(parsed.translation ?? "").trim();
  if (!translation) throw new Error("AI 返回了空译文");

  const glossaryUpdates = Array.isArray(parsed.glossary_updates)
    ? parsed.glossary_updates
        .map((entry) => ({
          source: String(entry?.source ?? "").trim().slice(0, 120),
          target: String(entry?.target ?? "").trim().slice(0, 120),
          note: String(entry?.note ?? "").trim().slice(0, 200)
        }))
        .filter((entry) => entry.source && entry.target)
        .slice(0, 20)
    : [];

  return { translation, glossaryUpdates };
}

export function mergeGlossary(current, updates, limit = 200) {
  const merged = new Map(current.map((entry) => [entry.source, entry]));
  for (const entry of updates) merged.set(entry.source, entry);
  return [...merged.values()].slice(-limit);
}

export function findCachedTranslation(cache, query) {
  return cache.find(
    (entry) =>
      String(entry.gameKey ?? "") === String(query.gameKey ?? "") &&
      entry.source === query.source &&
      String(entry.speaker ?? "") === String(query.speaker ?? "") &&
      String(entry.contextFingerprint ?? "0:811c9dc5") === String(query.contextFingerprint ?? "0:811c9dc5") &&
      entry.model === query.model &&
      entry.targetLanguage === query.targetLanguage
  );
}

export function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchJsonWithRetry(
  url,
  init,
  {
    fetchImpl = fetch,
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    timeoutMs = 25_000,
    maxAttempts = 2
  } = {}
) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (response.ok || !isRetryableStatus(response.status) || attempt === maxAttempts - 1) {
        return { response, data };
      }
      const retryAfter = Number(response.headers?.get?.("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 600 * 2 ** attempt;
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) throw error;
      await sleep(600 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("AI 请求失败");
}
