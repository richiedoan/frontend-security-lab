import assert from "node:assert/strict";
import { test } from "node:test";
import { createRefreshExperiment } from "../app/labs/token-refresh/experiment";

const a = "a".repeat(43);
const b = "b".repeat(43);

test("the UI experiment sends A -> A -> B and returns only status observations", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.method, "POST");
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as unknown });
    return calls.length <= 2
      ? Response.json({ refresh_token: calls.length === 1 ? a : b, access_token: "discard-access-token" })
      : new Response(null, { status: 401 });
  };
  const experiment = createRefreshExperiment();
  try {
    for (const step of ["login", "rotate", "retry", "check"] as const) {
      const result = await experiment.run(step);
      assert.equal(result.passed, true);
      assert.deepEqual(Object.keys(result), ["step", "status", "expected", "passed"]);
    }
    assert.deepEqual(calls, [
      { url: "http://localhost:4000/token/login", body: { username: "alice" } },
      ...[a, a, b].map(refresh_token => ({ url: "http://localhost:4000/token/refresh", body: { refresh_token } })),
    ]);
    await assert.rejects(experiment.run("check"));
  } finally { experiment.clear(); globalThis.fetch = original; }
});

test("unexpected HTTP results stop the experiment instead of claiming reuse protection", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; return new Response(null, { status: 503 }); };
  try {
    const experiment = createRefreshExperiment();
    const result = await experiment.run("login");
    assert.deepEqual(result, { step: "login", status: 503, expected: 200, passed: false });
    await assert.rejects(experiment.run("login"));
    assert.equal(count, 1);
    experiment.clear();
  } finally { globalThis.fetch = original; }
});

test("reset aborts in-flight login and does not retain a late response", async () => {
  const original = globalThis.fetch;
  let deliver!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = (_url, init) => {
    signal = init?.signal;
    return new Promise<Response>(resolve => { deliver = resolve; });
  };
  try {
    const experiment = createRefreshExperiment();
    const pending = experiment.run("login");
    const rejected = assert.rejects(pending);
    await assert.rejects(experiment.run("login")); // Double click cannot send a second login.
    experiment.clear();
    assert.equal(signal?.aborted, true);
    deliver(Response.json({ refresh_token: a }));
    await rejected;
    await assert.rejects(experiment.run("rotate"));
  } finally { globalThis.fetch = original; }
});

test("network failure never auto-retries a possibly consumed refresh token", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    if (count === 1) return Response.json({ refresh_token: a });
    throw new Error("network error with potentially sensitive details");
  };
  try {
    const experiment = createRefreshExperiment();
    await experiment.run("login");
    await assert.rejects(experiment.run("rotate"), /server may already have consumed A/);
    await assert.rejects(experiment.run("rotate"));
    assert.equal(count, 2);
    experiment.clear();
  } finally { globalThis.fetch = original; }
});
