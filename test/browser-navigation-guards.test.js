import assert from "node:assert/strict";
import test from "node:test";

import { classifyNavigation, installNavigationGuards } from "../browser/navigation-guards.mjs";

function createMockContents() {
  const listeners = new Map();
  const loadedUrls = [];
  return {
    listeners,
    loadedUrls,
    setWindowOpenHandler(handler) {
      this.windowOpenHandler = handler;
    },
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    loadURL(url) {
      loadedUrls.push(url);
      return Promise.resolve();
    }
  };
}

test("Electron 44 navigation details use a single event object", () => {
  const contents = createMockContents();
  const scheduled = [];
  installNavigationGuards(contents, (callback) => scheduled.push(callback));

  let prevented = false;
  const gameUrl = "https://3092.sv02.novelgame.jp/game/3092/Game/";
  contents.listeners.get("will-frame-navigate")({
    url: gameUrl,
    isMainFrame: false,
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.deepEqual(contents.loadedUrls, [gameUrl]);
});

test("main-frame game redirects stay allowed and external redirects are blocked", () => {
  assert.equal(classifyNavigation({ url: "https://novelgame.jp/games/play/3092", isMainFrame: true }), "allow");

  const contents = createMockContents();
  installNavigationGuards(contents, (callback) => callback());
  let prevented = false;
  contents.listeners.get("will-redirect")({
    url: "https://example.com/game",
    isMainFrame: true,
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(prevented, true);
});
