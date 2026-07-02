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
            ["<pre>Translated Chinese</pre>"],
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

function createGoogleHarness(
  responseFactory,
  responseDelay = 0,
  testConsole = console
) {
  const postRequests = [];
  let messageListener = null;

  class FakeXMLHttpRequest {
    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader() {}

    send(body) {
      const respond = () => {
        if (this.method === "GET") {
          this.responseText = "";
        } else {
          const request = JSON.parse(body)[0];
          postRequests.push(request);
          this.response = responseFactory(request);
        }
        this.onload({});
      };
      if (responseDelay) {
        setTimeout(respond, responseDelay);
      } else {
        queueMicrotask(respond);
      }
    }
  }

  const context = vm.createContext({
    URL,
    TextDecoder,
    clearTimeout,
    console: testConsole,
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

  return { messageListener, postRequests };
}

function translateHtml(messageListener, sourceArray2d) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Translation timed out")),
      1000
    );
    messageListener(
      {
        action: "translateHTML",
        translationService: "google",
        sourceLanguage: "auto",
        targetLanguage: "ru",
        sourceArray2d,
        dontSortResults: false,
      },
      { tab: { incognito: false } },
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      }
    );
  });
}

test("Google does not retry Han-only Japanese text as Chinese", async () => {
  const { messageListener, postRequests } = createGoogleHarness((request) => [
    ["<pre>\u6771\u4eac\u5927\u5b66</pre>"],
    ["ja"],
  ]);

  const result = await translateHtml(messageListener, [["\u6771\u4eac\u5927\u5b66"]]);

  assert.equal(postRequests.length, 1);
  assert.equal(postRequests[0][1], "auto");
  assert.deepEqual(Array.from(result[0]), ["\u6771\u4eac\u5927\u5b66"]);
});

test("completed translations are released from the in-memory request map", async () => {
  const { messageListener, postRequests } = createGoogleHarness(() => [
    ["<pre>Translated</pre>"],
    ["en"],
  ]);

  await translateHtml(messageListener, [["Cache me"]]);
  await translateHtml(messageListener, [["Cache me"]]);

  assert.equal(postRequests.length, 2);
});

test("failed translations are released so a later request can retry", async () => {
  const { messageListener, postRequests } = createGoogleHarness(
    () => null,
    0,
    { error() {} }
  );

  assert.equal(await translateHtml(messageListener, [["Retry me"]]), undefined);
  assert.equal(await translateHtml(messageListener, [["Retry me"]]), undefined);

  assert.equal(postRequests.length, 2);
});

test("concurrent identical translations still share one HTTP request", async () => {
  const { messageListener, postRequests } = createGoogleHarness(
    () => [["<pre>Translated</pre>"], ["en"]],
    10
  );

  const [first, second] = await Promise.all([
    translateHtml(messageListener, [["Same request"]]),
    translateHtml(messageListener, [["Same request"]]),
  ]);

  assert.equal(postRequests.length, 1);
  assert.deepEqual(Array.from(first[0]), ["Translated"]);
  assert.deepEqual(Array.from(second[0]), ["Translated"]);
});

test("parallel DeepL first-tab responses are correlated by request and tab", async () => {
  const listeners = new Set();
  const pendingTabs = [];
  let nextTabId = 1;

  const context = vm.createContext({
    URL,
    TextDecoder,
    clearTimeout,
    console,
    setTimeout,
    XMLHttpRequest: class {},
    checkedLastError() {},
    tabsCreate(url, callback) {
      pendingTabs.push({ url, callback, id: nextTabId++ });
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.add(listener);
          },
          removeListener(listener) {
            listeners.delete(listener);
          },
        },
      },
      tabs: {
        get() {},
        sendMessage() {},
      },
    },
    translationCache: { async get() { return null; }, set() {} },
    twpConfig: {
      get(name) {
        return {
          customServices: [],
          enabledServices: ["deepl"],
        }[name];
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
  const service = vm.runInContext("translationService", context);

  const firstPromise = service.translateSingleText(
    "deepl",
    "auto",
    "ru",
    "first"
  );
  const secondPromise = service.translateSingleText(
    "deepl",
    "auto",
    "ru",
    "second"
  );

  assert.equal(pendingTabs.length, 2);
  pendingTabs.forEach((pending) => pending.callback({ id: pending.id }));

  const requestIds = pendingTabs.map((pending) =>
    decodeURIComponent(pending.url.split("!#")[2])
  );
  const emit = (request, tabId) => {
    Array.from(listeners).forEach((listener) =>
      listener(request, { tab: { id: tabId } }, () => {})
    );
  };

  emit(
    {
      action: "DeepL_firstTranslationResult",
      requestId: requestIds[1],
      result: "second result",
    },
    pendingTabs[1].id
  );
  emit(
    {
      action: "DeepL_firstTranslationResult",
      requestId: requestIds[0],
      result: "first result",
    },
    pendingTabs[0].id
  );

  assert.equal(await firstPromise, "first result");
  assert.equal(await secondPromise, "second result");
});
