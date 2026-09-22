import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_HOME,
  isAllowedNavigation,
  isHostedGameUrl,
  normalizeNavigation
} from "../browser/url-policy.mjs";

test("standalone browser accepts novelgame pages and hosted game shards", () => {
  assert.equal(isAllowedNavigation("https://novelgame.jp/games/show/3092"), true);
  assert.equal(isAllowedNavigation("https://3092.sv02.novelgame.jp/game/3092/Game/"), true);
  assert.equal(isHostedGameUrl("https://3092.sv02.novelgame.jp/game/3092/Game/"), true);
});

test("standalone browser rejects external and unsafe navigation", () => {
  assert.equal(isAllowedNavigation("https://example.com/"), false);
  assert.equal(isAllowedNavigation("http://novelgame.jp/"), false);
  assert.equal(isAllowedNavigation("javascript:alert(1)"), false);
});

test("address bar accepts a work id and defaults to home", () => {
  assert.equal(normalizeNavigation("3092"), "https://novelgame.jp/games/show/3092");
  assert.equal(normalizeNavigation(""), BROWSER_HOME);
  assert.throws(() => normalizeNavigation("example.com"), /只允许访问/);
});

