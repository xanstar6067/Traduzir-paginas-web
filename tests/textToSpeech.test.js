"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("text-to-speech audio cache uses a 100-entry LRU limit", () => {
  class FakeAudio {
    constructor() {
      this.paused = true;
    }
    pause() {}
  }

  const context = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: {},
    Audio: FakeAudio,
    HTMLAudioElement: FakeAudio,
    chrome: { runtime: { onMessage: { addListener() {} } } },
    twpConfig: {
      get(name) {
        return { ttsSpeed: 1, ttsVolume: 1, proxyServers: {} }[name];
      },
      onChanged() {},
      onReady(callback) {
        callback();
      },
    },
  });

  const sourcePath = path.join(
    __dirname,
    "..",
    "src",
    "background",
    "textToSpeech.js"
  );
  vm.runInContext(fs.readFileSync(sourcePath, "utf8"), context);
  const service = vm.runInContext("textToSpeech.google", context);
  const audios = Array.from({ length: 102 }, () => new FakeAudio());

  for (let index = 0; index <= 100; index++) {
    service.cacheAudio(String(index), audios[index]);
  }

  assert.equal(service.audios.size, 100);
  assert.equal(service.audios.has("0"), false);

  service.getCachedAudio("1");
  service.cacheAudio("101", audios[101]);

  assert.equal(service.audios.size, 100);
  assert.equal(service.audios.has("1"), true);
  assert.equal(service.audios.has("2"), false);
});
