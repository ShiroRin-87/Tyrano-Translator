import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranslationRequest,
  extractResponseText,
  findCachedTranslation,
  gameKeyFromUrl,
  mergeGlossary,
  parseTranslationResponse
} from "../src/background/translation-core.js";

const settings = {
  baseUrl: "https://api.openai.com/v1/",
  model: "test-model",
  targetLanguage: "简体中文"
};

test("buildTranslationRequest uses Responses structured output without storage", () => {
  const request = buildTranslationRequest({ text: "こんにちは", settings, glossary: [] });
  assert.equal(request.endpoint, "https://api.openai.com/v1/responses");
  assert.equal(request.body.store, false);
  assert.equal(request.body.input, "こんにちは");
  assert.equal(request.body.text.format.type, "json_schema");
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
  const cache = [{ source: "猫", model: "a", targetLanguage: "中文", translation: "猫" }];
  assert.equal(findCachedTranslation(cache, { source: "猫", model: "a", targetLanguage: "中文" })?.translation, "猫");
  assert.equal(findCachedTranslation(cache, { source: "猫", model: "b", targetLanguage: "中文" }), undefined);
});

test("game key uses the game directory rather than the whole page URL", () => {
  assert.equal(gameKeyFromUrl("https://games.example/title-a/index.html?save=1"), "https://games.example/title-a/");
});

