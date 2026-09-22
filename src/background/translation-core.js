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

export function buildTranslationRequest({ text, settings, glossary = [] }) {
  const glossaryText = glossary.length
    ? glossary.map(({ source, target, note }) => `${source} => ${target}${note ? ` (${note})` : ""}`).join("\n")
    : "（尚无术语）";

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
        "只翻译文字，不解释，不审查，不续写；保留换行、语气、称谓和标点风格。",
        "必须优先遵循已有术语表。识别值得长期保持一致的人名、地名、组织名或专用词，并在 glossary_updates 中给出新增或修订术语。",
        "不要把普通句子、标点或整段对白加入术语表。",
        `已有术语表：\n${glossaryText}`
      ].join("\n"),
      input: text,
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
      entry.source === query.source &&
      entry.model === query.model &&
      entry.targetLanguage === query.targetLanguage
  );
}
