import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryAdapter, createStorageAdapter, issueLabAccessToken, LAB_TOKEN_KEY, resetLabData } from "../app/labs/token-storage/adapters";

function storageFixture() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}

test("memory survives repeated reads, but a fresh document adapter starts empty", () => {
  const memory = createMemoryAdapter();
  memory.write("lab-access-fixture");
  assert.equal(memory.read(), "lab-access-fixture");
  assert.equal(memory.read(), "lab-access-fixture");
  assert.equal(createMemoryAdapter().read(), null);
  memory.clear();
  assert.equal(memory.read(), null);
});

test("storage adapters recover a saved access token and reset preserves unrelated site data", () => {
  const session = storageFixture();
  const local = storageFixture();
  const adapters = { memory: createMemoryAdapter(), sessionStorage: createStorageAdapter(() => session), localStorage: createStorageAdapter(() => local) };
  for (const adapter of Object.values(adapters)) adapter.write("lab-access-fixture");
  assert.equal(createStorageAdapter(() => session).read(), "lab-access-fixture");
  assert.equal(createStorageAdapter(() => local).read(), "lab-access-fixture");
  assert.deepEqual([...local.values], [[LAB_TOKEN_KEY, "lab-access-fixture"]]);
  local.setItem("unrelated", "keep");
  session.setItem("unrelated", "keep");
  assert.deepEqual(resetLabData(adapters), []);
  assert.deepEqual(resetLabData(adapters), []);
  for (const adapter of Object.values(adapters)) assert.equal(adapter.read(), null);
  assert.deepEqual([...session.values], [["unrelated", "keep"]]);
  assert.deepEqual([...local.values], [["unrelated", "keep"]]);
});

test("blocked storage does not prevent reset of the remaining adapters", () => {
  const memory = createMemoryAdapter();
  const local = storageFixture();
  local.setItem(LAB_TOKEN_KEY, "lab-access-fixture");
  memory.write("lab-access-fixture");
  const blocked = createStorageAdapter(() => { throw new Error("Browser policy denies storage"); });
  assert.throws(() => blocked.read());
  assert.deepEqual(resetLabData({ memory, sessionStorage: blocked, localStorage: createStorageAdapter(() => local) }), ["sessionStorage"]);
  assert.equal(memory.read(), null);
  assert.equal(local.getItem(LAB_TOKEN_KEY), null);
});

test("login uses only the fixed local API and returns only the access token", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://localhost:4000/token/login");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.signal, controller.signal);
    assert.equal(init?.body, JSON.stringify({ username: "alice" }));
    return Response.json({ access_token: "lab-access-fixture", refresh_token: "must-not-be-retained" });
  };
  try { assert.equal(await issueLabAccessToken(controller.signal), "lab-access-fixture"); }
  finally { globalThis.fetch = original; }
});

test("failed login and malformed responses cannot become stored tokens", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(issueLabAccessToken(), /Lab login failed/);
    for (const body of [null, {}, { access_token: 42 }, { refresh_token: "lab-refresh-fixture" }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(issueLabAccessToken(), /did not return an access token/);
    }
  } finally { globalThis.fetch = original; }
});
