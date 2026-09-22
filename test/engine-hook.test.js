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

test("engine hook neutralizes angle brackets before Tyrano builds HTML", async () => {
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
        detail: { id: event.detail.id, ok: true, translation: "<勇者>", displayMode: "translation" }
      })
    );
  });

  await import(`../src/page/engine-hook.js?sanitize=${Date.now()}`);
  textTag.start({ val: "勇者" });
  assert.deepEqual(calls, ["＜勇者＞"]);
});

test("engine hook keeps the game font and appends Chinese fallbacks", async () => {
  const messageSpan = { style: {} };
  const currentSpan = { lastElementChild: messageSpan };
  const pageDocument = new EventTarget();
  pageDocument.documentElement = { dataset: {} };
  globalThis.document = pageDocument;
  globalThis.CustomEvent = TestCustomEvent;
  globalThis.location = { href: "https://123.sv01.novelgame.jp/game/123/Game/" };
  globalThis.getComputedStyle = () => ({ fontFamily: '"Game Display Font"' });

  const textTag = {
    kag: {
      stat: { is_script: false, is_html: false },
      getMessageCurrentSpan: () => ({ get: () => currentSpan })
    },
    start() {}
  };
  globalThis.tyrano = { plugin: { kag: { tag: { text: textTag } } } };
  globalThis.TYRANO = { kag: { ftag: { master_tag: { text: textTag } } } };
  pageDocument.addEventListener("tyrano-translator:translate-request", (event) => {
    pageDocument.dispatchEvent(
      new TestCustomEvent("tyrano-translator:translate-response", {
        detail: { id: event.detail.id, ok: true, translation: "中文", displayMode: "translation" }
      })
    );
  });

  await import(`../src/page/engine-hook.js?font=${Date.now()}`);
  textTag.start({ val: "日本語" });

  assert.match(messageSpan.style.fontFamily, /^"Game Display Font",/);
  assert.match(messageSpan.style.fontFamily, /Microsoft YaHei/);
  assert.match(messageSpan.style.fontFamily, /Noto Sans CJK SC/);
});
