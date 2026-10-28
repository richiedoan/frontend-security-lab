import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { buildCsp, readCspMode } from "../csp";
import { proxy } from "../proxy";

test("CSP modes select exactly one header, with a fresh production nonce and no caching", () => {
  const oldMode = process.env.CSP_MODE;
  const oldEnv = process.env.NODE_ENV;
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    for (const mode of ["report-only", "enforce"]) {
      process.env.CSP_MODE = mode;
      const request = new NextRequest("http://localhost:3000/labs/csp", { headers: { "x-nonce": "attacker-value", "Content-Security-Policy": "default-src *" } });
      const first = proxy(request);
      const second = proxy(request);
      const name = mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
      const other = mode === "enforce" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
      const policy = first.headers.get(name)!;
      assert.ok(policy);
      assert.equal(first.headers.get(other), null);
      assert.notEqual(policy, second.headers.get(name));
      assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|attacker-value/);
      assert.match(policy, /'nonce-[A-Za-z0-9+/=]+'/);
      assert.equal(first.headers.get("x-middleware-request-content-security-policy"), policy);
      assert.equal(first.headers.get("Cache-Control"), "no-store");
    }
    delete process.env.CSP_MODE;
    const disabled = proxy(new NextRequest("http://localhost:3000"));
    assert.equal(disabled.headers.get("Content-Security-Policy"), null);
    assert.equal(disabled.headers.get("Content-Security-Policy-Report-Only"), null);
  } finally {
    if (oldMode === undefined) delete process.env.CSP_MODE;
    else process.env.CSP_MODE = oldMode;
    if (oldEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: oldEnv });
  }
});

test("both policies contain the required boundaries; development exceptions stay out of production", () => {
  for (const development of [false, true]) {
    const policy = buildCsp(development, "fake-test-nonce");
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'", "img-src 'self'"]) {
      assert.ok(policy.split('; ').includes(directive));
    }
    assert.ok(policy.includes("connect-src 'self' http://localhost:4000"));
    assert.ok(policy.includes("http://localhost:8080"));
    assert.equal(policy.includes("'unsafe-eval'"), development);
    assert.equal(policy.includes("'unsafe-inline'"), development);
    assert.equal(policy.includes("ws://localhost:3000"), development);
    assert.ok(!policy.includes("data:"));
    assert.ok(!policy.includes("http://localhost:3001"));
  }
  assert.equal(readCspMode(undefined), undefined);
  assert.throws(() => readCspMode("enfore"), /CSP_MODE/);
});
