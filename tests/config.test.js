"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadConfig() {
  const writes = [];
  let reloadCount = 0;
  const context = vm.createContext({
    URL,
    console,
    structuredClone,
    chrome: {
      i18n: {
        getAcceptLanguages(callback) {
          callback(["en"]);
        },
      },
      runtime: {
        getManifest() {
          return { version: "10.1.1.3", commands: {} };
        },
        reload() {
          reloadCount++;
        },
      },
      storage: {
        local: {
          get(name, callback) {
            callback({});
          },
          set(value) {
            writes.push(value);
          },
        },
        onChanged: { addListener() {} },
      },
    },
    twpLang: {
      fixTLanguageCode(language) {
        return language;
      },
    },
  });

  const configPath = path.join(__dirname, "..", "src", "lib", "config.js");
  vm.runInContext(fs.readFileSync(configPath, "utf8"), context);

  return {
    config: vm.runInContext("twpConfig", context),
    writes,
    get reloadCount() {
      return reloadCount;
    },
  };
}

test("settings backup excludes custom service API keys", () => {
  const harness = loadConfig();
  harness.config.set("customServices", [
    {
      name: "libre",
      url: "https://translate.example/translate",
      apiKey: "libre-secret-key",
    },
    { name: "deepl_freeapi", apiKey: "deepl-secret-key" },
  ]);

  const backupText = harness.config.export();
  const backup = JSON.parse(backupText);

  assert.equal("customServices" in backup, false);
  assert.deepEqual(Array.from(backup.excludedSettings), ["customServices"]);
  assert.equal(backupText.includes("libre-secret-key"), false);
  assert.equal(backupText.includes("deepl-secret-key"), false);
});

test("invalid imported settings are rejected before any storage write", () => {
  const harness = loadConfig();
  harness.writes.length = 0;

  assert.throws(
    () =>
      harness.config.import(
        JSON.stringify({
          showReleaseNotes: "yes",
          targetLanguages: "not-an-array",
        })
      ),
    /targetLanguages/
  );

  assert.equal(harness.writes.length, 0);
  assert.equal(harness.reloadCount, 0);
});

test("import rejects insecure LibreTranslate endpoints", () => {
  const harness = loadConfig();
  harness.writes.length = 0;

  assert.throws(() =>
    harness.config.import(
      JSON.stringify({
        customServices: [
          {
            name: "libre",
            url: "http://translate.example/translate",
            apiKey: "long-enough-key",
          },
        ],
      })
    )
  );

  assert.equal(harness.writes.length, 0);
  assert.equal(harness.reloadCount, 0);
});

test("import accepts HTTP LibreTranslate only on localhost", () => {
  const harness = loadConfig();
  harness.writes.length = 0;

  harness.config.import(
    JSON.stringify({
      customServices: [
        {
          name: "libre",
          url: "http://127.0.0.1:5000/translate",
          apiKey: "long-enough-key",
        },
      ],
    })
  );

  assert.equal(harness.writes.length, 1);
  assert.equal(harness.reloadCount, 1);
});
