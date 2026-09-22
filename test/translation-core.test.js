import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  analyzeTranslation,
  buildTranslationRequest,
  contextFingerprint,
  extractResponseText,
  fetchJsonWithRetry,
  findCachedTranslation,
  gameKeyFromUrl,
  isRetryableStatus,
  mergeGlossary,
  parseTranslationResponse,
  protectTextLayout,
  restoreTextLayout,
  selectRelevantGlossary
} from "../src/background/translation-core.js";

const settings = {
  baseUrl: "https://api.openai.com/v1/",
  model: "test-model",
  targetLanguage: "简体中文"
};

test("default display mode replaces source text", () => {
  assert.equal(DEFAULT_SETTINGS.displayMode, "translation");
  assert.equal(DEFAULT_SETTINGS.rubyPosition, "over");
});

test("buildTranslationRequest uses Responses structured output without storage", () => {
  const request = buildTranslationRequest({
    text: "こんにちは<br>世界",
    speaker: "アリス",
    context: [{ speaker: "ボブ", source: "やあ", translation: "你好" }],
    settings,
    glossary: []
  });
  assert.equal(request.endpoint, "https://api.openai.com/v1/responses");
  assert.equal(request.body.store, false);
  assert.deepEqual(JSON.parse(request.body.input), {
    name: "アリス",
    message: "こんにちは<br>世界",
    previous_context: [{ name: "ボブ", source: "やあ", translation: "你好" }]
  });
  assert.equal(request.body.text.format.type, "json_schema");
});

test("buildTranslationRequest keeps the latest ten context lines", () => {
  const context = Array.from({ length: 12 }, (_, index) => ({
    speaker: `角色${index}`,
    source: `原文${index}`,
    translation: `译文${index}`
  }));
  const request = buildTranslationRequest({ text: "次の行", context, settings, glossary: [] });
  const input = JSON.parse(request.body.input);

  assert.equal(input.previous_context.length, 10);
  assert.equal(input.previous_context[0].source, "原文2");
  assert.equal(input.previous_context.at(-1).source, "原文11");
});

test("GPP-style preprocessing preserves line breaks and tabs", () => {
  const layout = protectTextLayout("一行目\r\n二行目\t末尾");
  assert.equal(layout.text, "一行目<br>二行目<tab>末尾");
  assert.equal(restoreTextLayout("第一行<br>第二行<tab>结尾", layout), "第一行\r\n第二行\t结尾");
  assert.deepEqual(
    analyzeTranslation({
      source: "一行目\r\n二行目",
      rawTranslation: "第一行",
      layout,
      targetLanguage: "简体中文"
    }),
    ["换行数量不一致", "制表符数量不一致"]
  );
});

test("only glossary entries found in the sentence or rolling context are sent", () => {
  const glossary = [
    { source: "アリス", target: "爱丽丝", note: "人名" },
    { source: "王都", target: "王都", note: "地名" },
    { source: "魔王", target: "魔王", note: "称号" }
  ];
  assert.deepEqual(
    selectRelevantGlossary("王都へ行く", glossary, [{ speaker: "アリス", source: "準備して" }]),
    glossary.slice(0, 2)
  );
});

test("rolling context fingerprints are stable and order-sensitive", () => {
  const first = [{ speaker: "A", source: "一" }, { speaker: "B", source: "二" }];
  assert.equal(contextFingerprint(first), contextFingerprint(structuredClone(first)));
  assert.notEqual(contextFingerprint(first), contextFingerprint(first.toReversed()));
});

test("parseTranslationResponse reads nested output and cleans glossary", () => {
  const payload = JSON.stringify({
    translation: "你好",
    glossary_updates: [{ source: " アリス ", target: " 爱丽丝 ", note: " 人名 " }]
  });
  const response = { output: [{ content: [{ type: "output_text", text: payload }] }] };
  assert.equal(extractResponseText(response), payload);
  assert.deepEqual(parseTranslationResponse(response), {
    translation: "你好",
    glossaryUpdates: [{ source: "アリス", target: "爱丽丝", note: "人名" }]
  });
});

test("glossary updates replace the same source term", () => {
  assert.deepEqual(
    mergeGlossary(
      [{ source: "魔王", target: "魔王", note: "称号" }],
      [{ source: "魔王", target: "魔王大人", note: "角色称呼" }]
    ),
    [{ source: "魔王", target: "魔王大人", note: "角色称呼" }]
  );
});

test("cache match includes model and target language", () => {
  const cache = [{ gameKey: "game-a", source: "猫", model: "a", targetLanguage: "中文", translation: "猫" }];
  assert.equal(findCachedTranslation(cache, { gameKey: "game-a", source: "猫", model: "a", targetLanguage: "中文" })?.translation, "猫");
  assert.equal(findCachedTranslation(cache, { gameKey: "game-a", source: "猫", model: "b", targetLanguage: "中文" }), undefined);
  assert.equal(findCachedTranslation(cache, { gameKey: "game-b", source: "猫", model: "a", targetLanguage: "中文" }), undefined);
});

test("game key uses the game directory rather than the whole page URL", () => {
  assert.equal(gameKeyFromUrl("https://games.example/title-a/index.html?save=1"), "https://games.example/title-a/");
});

test("retry policy covers throttling and temporary server failures", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(401), false);
});

test("fetchJsonWithRetry retries a throttled request once", async () => {
  const statuses = [429, 200];
  let calls = 0;
  const fetchImpl = async () => {
    const status = statuses[calls++];
    return {
      ok: status === 200,
      status,
      headers: { get: () => null },
      json: async () => ({ status })
    };
  };

  const result = await fetchJsonWithRetry("https://api.example/responses", {}, {
    fetchImpl,
    sleep: async () => {},
    timeoutMs: 100,
    maxAttempts: 2
  });
  assert.equal(result.response.status, 200);
  assert.equal(calls, 2);
});
