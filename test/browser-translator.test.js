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

