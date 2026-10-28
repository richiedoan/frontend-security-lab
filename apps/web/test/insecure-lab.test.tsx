import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import InsecureLabLayout from "../app/labs/xss/insecure/layout";

test("the insecure route is unavailable outside development", () => {
  const original = process.env.NODE_ENV;
  try {
    for (const mode of ["production", "test"]) {
      Object.assign(process.env, { NODE_ENV: mode });
      assert.throws(
        () => renderToStaticMarkup(<InsecureLabLayout>demo</InsecureLabLayout>),
        /NEXT_HTTP_ERROR_FALLBACK;404/,
      );
    }
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal(renderToStaticMarkup(<InsecureLabLayout>demo</InsecureLabLayout>), "demo");
  } finally {
    if (original === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: original });
  }
});
