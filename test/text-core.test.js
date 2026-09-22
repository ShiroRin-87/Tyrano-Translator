import assert from "node:assert/strict";
import test from "node:test";

await import("../src/content/text-core.js");
const { normalizeText, shouldTranslate } = globalThis.TyranoTextCore;

test("normalizeText cleans browser text without flattening meaningful lines", () => {
  assert.equal(normalizeText("  こんにちは\u200b   世界 \r\n 次の行  "), "こんにちは 世界\n次の行");
});

test("shouldTranslate accepts dialogue and names", () => {
  assert.equal(shouldTranslate("アリス"), true);
  assert.equal(shouldTranslate("Hello, world!"), true);
  assert.equal(shouldTranslate("你好！"), true);
});

test("shouldTranslate rejects empty, numeric, and URL-only values", () => {
  assert.equal(shouldTranslate("…… 123"), false);
  assert.equal(shouldTranslate("https://example.com/game"), false);
  assert.equal(shouldTranslate("   "), false);
});

