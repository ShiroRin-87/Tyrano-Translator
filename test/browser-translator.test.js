import assert from "node:assert/strict";
import test from "node:test";

import { TranslationService, browserStoreDefaults, sanitizeBrowserSettings } from "../browser/translator.mjs";

class MemoryStore {
  constructor() { this.data = browserStoreDefaults(); }
  read() { return structuredClone(this.data); }
  async update(mutator) { this.data = await mutator(structuredClone(this.data)); return this.read(); }
}

test("browser settings preserve supported display choices", () => {
  const settings = sanitizeBrowserSettings({
    enabled: true,
    apiKey: "secret",
    baseUrl: "https://api.example/v1/",
    model: "model-a",
    targetLanguage: "简体中文",
    displayMode: "ruby",
    rubyPosition: "under"
  });
  assert.equal(settings.baseUrl, "https://api.example/v1");
  assert.equal(settings.displayMode, "ruby");
  assert.equal(settings.rubyPosition, "under");
});

test("browser translation service caches AI responses", async () => {
  const store = new MemoryStore();
  await store.update((data) => ({ ...data, apiKey: "secret", model: "test-model" }));
  let requestCount = 0;
  const service = new TranslationService(store, {
    fetchImpl: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          output_text: JSON.stringify({ translation: "你好", glossary_updates: [] })
        })
      };
    }
  });
  const payload = { text: "こんにちは", pageUrl: "https://1.sv01.novelgame.jp/game/1/Game/" };
  assert.equal((await service.translate(payload)).translation, "你好");
  assert.equal((await service.translate(payload)).cached, true);
  assert.equal(requestCount, 1);
});

test("browser translation follows rolling context and retries layout problems", async () => {
  const store = new MemoryStore();
  await store.update((data) => ({
    ...data,
    apiKey: "secret",
    model: "test-model",
    glossaries: {
      "https://1.sv01.novelgame.jp/game/1/Game/": [
        { source: "王都", target: "王都", note: "地名" },
        { source: "未命中", target: "不应发送", note: "测试" }
      ]
    }
  }));
  const requests = [];
  const outputs = ["你好", "没有换行", "前往王都<br>立刻出发"];
  const service = new TranslationService(store, {
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          output_text: JSON.stringify({ translation: outputs.shift(), glossary_updates: [] })
        })
      };
    }
  });
  const common = {
    pageUrl: "https://1.sv01.novelgame.jp/game/1/Game/",
    documentId: "document-a"
  };

  await service.translate({ ...common, speaker: "アリス", text: "こんにちは" });
  const result = await service.translate({ ...common, speaker: "ボブ", text: "王都へ\nすぐ行く" });

  assert.equal(result.translation, "前往王都\n立刻出发");
  assert.equal(requests.length, 3);
  assert.match(requests[1].instructions, /王都 => 王都/);
  assert.doesNotMatch(requests[1].instructions, /未命中 =>/);
  assert.match(requests[2].instructions, /换行数量不一致/);
  const secondInput = JSON.parse(requests[1].input);
  assert.equal(secondInput.name, "ボブ");
  assert.equal(secondInput.message, "王都へ<br>すぐ行く");
  assert.deepEqual(secondInput.previous_context, [
    { name: "アリス", source: "こんにちは", translation: "你好" }
  ]);
});
