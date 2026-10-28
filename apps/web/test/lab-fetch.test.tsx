import assert from "node:assert/strict";
import { test } from "node:test";
import { labFetch } from "../app/lab-fetch";

test("writes fetch the session token and send it only in a header to the fixed API", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(calls.length === 1 ? { csrfToken: "fake-test-token" } : { theme: "dark" });
  };
  try {
    await labFetch("/profile/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"theme":"dark"}' });
    assert.equal(calls[0].url, "http://localhost:4000/session/csrf");
    assert.equal(calls[0].init?.cache, "no-store");
    assert.equal(calls[1].url, "http://localhost:4000/profile/theme");
    assert.equal(new Headers(calls[1].init?.headers).get("x-csrf-token"), "fake-test-token");
    assert.equal(calls[1].init?.credentials, "include");
    assert.equal(calls[1].init?.body, '{"theme":"dark"}');
  } finally { globalThis.fetch = original; }
});

test("failed token retrieval prevents writes; GET and login need no token request", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(null, { status: 401 }); };
  try {
    await assert.rejects(labFetch("/comments/xss-demo", { method: "DELETE" }), /Sign in again/);
    assert.deepEqual(calls, ["http://localhost:4000/session/csrf"]);
    calls.length = 0;
    await labFetch("/profile/theme");
    await labFetch("/session/login", { method: "POST" });
    assert.deepEqual(calls, ["http://localhost:4000/profile/theme", "http://localhost:4000/session/login"]);
  } finally { globalThis.fetch = original; }
});
