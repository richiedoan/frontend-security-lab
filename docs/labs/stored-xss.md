# Local stored XSS demonstrations

Run `yarn dev`, sign in at http://localhost:3000, and open
http://localhost:3000/labs/xss/insecure. The web server binds to loopback;
the insecure page returns 404 outside development. Do not expose it through a tunnel or proxy.

The page has two independent sections with their own comments, result, status,
and controls. Loading a section filters stored comments to its exact payload;
it does not execute the other section's payload or old combined payloads.

## Demo 1: Execute JavaScript

1. Click **Store demo comment and load** in Demo 1.
2. Click **Check execution marker**. The result should be `executed`.
3. **Clear local demo data** removes this section's rendering and execution marker.
4. **Load stored comments** executes the saved payload again.
5. **Delete this demo’s stored comments** deletes only execution payload comments
   and clears the execution marker. It does not touch the fake storage key or Demo 2.

```html
<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLab = "executed"'>
```

This payload does not access localStorage.

## Demo 2: Read fake localStorage

1. Click **Set fake localStorage marker** in Demo 2. This writes only
   `xssLabMarker = "fake-xss-lab-value"`. Never put real data in this key.
2. Click **Store demo comment and load** in Demo 2.
3. Click **Show value read by XSS**. The result should be `fake-xss-lab-value`.
   The payload reads storage; the UI reads its DOM result and displays React text.
4. **Clear local demo data** removes this section's rendering, captured DOM value,
   and only the `xssLabMarker` storage key. It leaves Demo 1's marker intact.
5. **Load stored comments**, then show the value again: it should be `(missing)`.
6. **Delete this demo’s stored comments** deletes only storage payload comments
   and performs the same local cleanup without changing Demo 1.

```html
<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLabValue = localStorage.getItem("xssLabMarker") ?? "(missing)"'>
```

This payload never sets the `executed` marker and never reads other storage keys.
Both payloads use an invalid inline image, so no image network request is made.
Neither reads or transmits real cookies, tokens, credentials, files, clipboard,
or network data. Captured storage values are never included in API requests.
The surrounding page uses the ordinary authenticated local comment API.

## Cleanup and persistence

Both demos survive page reloads through comments stored in the API's memory.
Use **Load stored comments** in the desired section after a reload.
Navigating back to secure comments unmounts the lab and clears both DOM markers
and the fake storage key. Full reloads or closing a tab may retain localStorage;
use explicit cleanup before closing the lab to remove the fake key.

The authenticated reset endpoints return `{ deleted: number }`:

- `DELETE /comments/xss-demo/execution`: exact execution payload only.
- `DELETE /comments/xss-demo/storage`: exact storage payload only.
- `DELETE /comments/xss-demo`: retained for full reset, including legacy combined payloads.

The per-section buttons use the first two endpoints. They preserve the other
section's comments, legacy comments, and normal comments. Repeated resets return
zero when no matches remain. These endpoints require a session and do not depend
on `NODE_ENV`. Restarting the API clears all in-memory comments.

## Why React text rendering is safe here

The normal comments component uses `{comment.text}` as a React text child.
React treats the value as text and escapes HTML characters when generating HTML.
Tags and event-handler strings therefore cannot become executable elements.
The API preserves the original strings as JSON; length validation alone is not
an XSS defense.

`dangerouslySetInnerHTML` bypasses that boundary and asks the browser to parse
HTML. The image's error handler can then execute JavaScript with the page's
privileges, including same-origin localStorage access. Different URL paths do
not isolate storage. Each section accepts only its own exact fixed payload at
this sink; this is containment for the exercise, not a general sanitizer.
Normal comments and captured result values remain React text.

Tests check isolated handler behavior, cleanup that preserves the other demo,
authenticated selective API deletion, and inert rendering in normal comments.
