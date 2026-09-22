import assert from "node:assert/strict";
import test from "node:test";

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

test("engine hook replaces Japanese before Tyrano start renders it", async () => {
  const calls = [];
  const pageDocument = new EventTarget();
  pageDocument.documentElement = { dataset: {} };
  globalThis.document = pageDocument;
  globalThis.CustomEvent = TestCustomEvent;
  globalThis.location = { href: "https://games.example/title/index.html" };

  const textTag = {
    kag: { stat: { is_script: false, is_html: false } },
    start(pm) {
      calls.push(pm.val);
    }
  };
  globalThis.tyrano = { plugin: { kag: { tag: { text: textTag } } } };
  globalThis.TYRANO = { kag: { ftag: { master_tag: { text: textTag } } } };

  pageDocument.addEventListener("tyrano-translator:translate-request", (event) => {
    pageDocument.dispatchEvent(
      new TestCustomEvent("tyrano-translator:translate-response", {
        detail: {
          id: event.detail.id,
          ok: true,
          translation: "早上好",
          displayMode: "translation"
        }
      })
    );
  });

  await import(`../src/page/engine-hook.js?test=${Date.now()}`);
  textTag.start({ val: "おはよう" });

  assert.deepEqual(calls, ["早上好"]);
  assert.equal(pageDocument.documentElement.dataset.tyranoTranslatorEngineHook, "active");
});

