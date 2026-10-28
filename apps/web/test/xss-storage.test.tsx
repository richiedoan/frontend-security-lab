import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { clearExecutionMarker, clearStorageMarker, STORAGE_PAYLOAD, EXECUTION_PAYLOAD, LEGACY_COMBINED_PAYLOAD, FAKE_MARKER_VALUE } from "../app/labs/xss/insecure/demo";

test("the actual payload reads only the fake key and writes only the storage result", () => {
  const handler = STORAGE_PAYLOAD.match(/onerror='([^']+)'/u)?.[1];
  assert.ok(handler);
  for (const value of [FAKE_MARKER_VALUE, null]) {
    const reads: string[] = [];
    const dataset: DOMStringMap = {};
    runInNewContext(handler, {
      document: new Proxy({ body: { dataset } }, {
        get(target, property) {
          assert.equal(property, "body");
          return target.body;
        },
      }),
      localStorage: {
        getItem(key: string) {
          assert.equal(key, "xssLabMarker");
          reads.push(key);
          return value;
        },
      },
      // No network, clipboard, cookies, or other browser APIs are available.
    }, { timeout: 1000 });
    assert.deepEqual(reads, ["xssLabMarker"]);
    assert.deepEqual(dataset, { xssLabValue: value ?? "(missing)" });
  }
  assert.ok(STORAGE_PAYLOAD.startsWith('<img src="data:image/png;base64,AA=="'));
});

test("cleanup removes only lab storage and DOM markers and is repeatable", () => {
  const values = new Map([["xssLabMarker", FAKE_MARKER_VALUE], ["unrelatedFakeFixture", "keep"]]);
  const dataset = { xssLab: "executed", xssLabValue: FAKE_MARKER_VALUE, unrelated: "keep" };
  const storage = { removeItem(key: string) { assert.equal(key, "xssLabMarker"); values.delete(key); } };
  clearStorageMarker(dataset, storage);
  clearStorageMarker(dataset, storage);
  assert.deepEqual(dataset, { xssLab: "executed", unrelated: "keep" });
  clearExecutionMarker(dataset);
  clearExecutionMarker(dataset);
  assert.deepEqual([...values], [["unrelatedFakeFixture", "keep"]]);
  assert.deepEqual(dataset, { unrelated: "keep" });
});

test("execution payload never accesses localStorage or changes its result", () => {
  const handler = EXECUTION_PAYLOAD.match(/onerror='([^']+)'/u)?.[1];
  assert.ok(handler);
  const dataset = { xssLabValue: "keep" };
  runInNewContext(handler, { document: { body: { dataset } } }, { timeout: 1000 });
  assert.deepEqual(dataset, { xssLab: "executed", xssLabValue: "keep" });
  clearExecutionMarker(dataset);
  assert.deepEqual(dataset, { xssLabValue: "keep" });
});

test("API cleanup fixtures match both independent payloads and the previous combined fixture", () => {
  const apiSource = readFileSync("../api/src/xss-lab.ts", "utf8");
  for (const [name, payload] of Object.entries({ EXECUTION_PAYLOAD, STORAGE_PAYLOAD, LEGACY_COMBINED_PAYLOAD })) {
    assert.ok(apiSource.includes(`export const ${name} = \`${payload}\`;`));
  }
});
