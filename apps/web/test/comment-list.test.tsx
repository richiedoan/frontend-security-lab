import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentList } from "../app/comment-list";
import { EXECUTION_PAYLOAD, STORAGE_PAYLOAD } from "../app/labs/xss/insecure/demo";

for (const text of [EXECUTION_PAYLOAD, STORAGE_PAYLOAD]) {
  test(`the normal comments page renders this demo as inert text: ${text}`, () => {
    const html = renderToStaticMarkup(<CommentList comments={[{ id: "lab", authorId: "alice", text }]} />);
    assert.ok(html.includes("&lt;img src=&quot;data:image/png;base64,AA==&quot;"));
    assert.doesNotMatch(html, /<(svg|img)\b/i);
  });
}

test("HTML-like comments render as escaped text with no executable elements", () => {
  const text = '<script>alert("x")</script>\n<img src=x onerror=alert(1)> & <b>hello</b>';
  const html = renderToStaticMarkup(
    <CommentList comments={[{ id: "1", authorId: "alice", text }]} />,
  );
  assert.equal(html, '<ul><li><strong>alice</strong><p class="comment-text">' +
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\n' +
    '&lt;img src=x onerror=alert(1)&gt; &amp; &lt;b&gt;hello&lt;/b&gt;</p></li></ul>');
  assert.doesNotMatch(html, /<(script|img|b)\b/i);
});

test("entity-like input and author text are escaped once, preserving their literal meaning", () => {
  const html = renderToStaticMarkup(
    <CommentList comments={[{ id: "2", authorId: "<svg onload=alert(1)>", text: "  &lt;img&gt;\nhello  " }]} />,
  );
  assert.ok(html.includes("&lt;svg onload=alert(1)&gt;"));
  assert.ok(html.includes('>  &amp;lt;img&amp;gt;\nhello  </p>'));
  assert.doesNotMatch(html, /<(svg|img)\b/i);
});
