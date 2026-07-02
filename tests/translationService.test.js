"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Google retries Chinese text dropped from an auto-detected mixed block", async () => {
  const requestedSourceLanguages = [];
  let messageListener = null;

  class FakeXMLHttpRequest {
    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader() {}

    send(body) {
      queueMicrotask(() => {
        if (this.method === "GET") {
          this.responseText = "";
          this.onload({});
          return;
        }

        const request = JSON.parse(body)[0];
        const sourceLanguage = request[1];
        requestedSourceLanguages.push(sourceLanguage);

        if (sourceLanguage === "auto") {
          this.response = [
            ["<pre><a i=0>Translated English</a><a i=1>.</a></pre>"],
            ["en"],
          ];
        } else {
          this.response = [
            [
              "<pre><a i=0>Translated English</a>" +
                "<a i=1>Translated Chinese</a></pre>",
            ],
            ["zh-TW"],
          ];
        }

        this.onload({});
      });
    }
  }

  const context = vm.createContext({
    URL,
    TextDecoder,
    clearTimeout,
    console,
    queueMicrotask,
    setTimeout,
    XMLHttpRequest: FakeXMLHttpRequest,
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
      },
    },
    translationCache: {
      async get() {
        return null;
      },
      set() {},
    },
    twpConfig: {
      get(name) {
        const values = {
          customServices: [],
          enableDiskCache: "no",
          enabledServices: ["google"],
        };
        return values[name];
      },
      onChanged() {},
      onReady() {},
    },
    twpLang: {
      getAlternativeService(targetLanguage, serviceName) {
        return serviceName;
      },
    },
  });

  const servicePath = path.join(
    __dirname,
    "..",
    "src",
    "background",
    "translationService.js"
  );
  vm.runInContext(fs.readFileSync(servicePath, "utf8"), context);

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Translation timed out")),
      1000
    );
    const keepChannelOpen = messageListener(
      {
        action: "translateHTML",
        translationService: "google",
        sourceLanguage: "auto",
        targetLanguage: "ru",
        sourceArray2d: [["This is English.", "\u9019\u662f\u7e41\u9ad4\u4e2d\u6587\u3002"]],
        dontSortResults: false,
      },
      { tab: { incognito: false } },
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      }
    );

    assert.equal(keepChannelOpen, true);
  });

  assert.deepEqual(requestedSourceLanguages, ["auto", "zh-TW"]);
  assert.deepEqual(Array.from(result[0]), [
    "Translated English",
    "Translated Chinese",
  ]);
});
