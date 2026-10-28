"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ADAPTER_NAMES, adapters, issueLabAccessToken, LAB_TOKEN_KEY, resetLabData, type AdapterName } from "./adapters";

const labels: Record<AdapterName, string> = {
  memory: "Memory only (default)", sessionStorage: "sessionStorage (educational)", localStorage: "localStorage (educational)",
};
const listeners = new Set<() => void>();
function notify() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LAB_TOKEN_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
function snapshot(name: AdapterName) {
  try { return adapters[name].read() ? "Present" : "Empty"; }
  catch { return "Storage unavailable"; }
}
function StoredStatus({ name }: { name: AdapterName }) {
  const status = useSyncExternalStore(subscribe, () => snapshot(name), () => "Checking in browser…");
  return <strong>{status}</strong>;
}

export default function TokenStorageLab() {
  const [selected, setSelected] = useState<AdapterName>("memory");
  const [renders, setRenders] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose an adapter and issue an Alice lab access token. Memory is selected by default.");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

  async function issue() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("Requesting a lab access token…");
    try {
      const token = await issueLabAccessToken(controller.signal);
      if (controller.signal.aborted) return;
      adapters[selected].write(token);
      notify();
      setMessage(`Stored an Alice lab access token in ${labels[selected]}. It expires in five minutes; storage does not extend validity.`);
    } catch {
      if (!controller.signal.aborted) setMessage("Could not issue or store a token. Check that the API runs on localhost:4000, this page uses localhost:3000, and the selected storage is allowed.");
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }

  function reset() {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    const failed = resetLabData(adapters);
    notify();
    setSelected("memory");
    setRenders(0);
    setMessage(failed.length ? `Reset incomplete: ${failed.join(", ")} is blocked by the browser. Other adapters were cleared; clear this site's data in browser settings.`
      : "Lab data reset: this tab’s memory and sessionStorage, and this origin’s shared localStorage lab key were cleared. Memory is selected.");
  }

  return <main>
    <Link href="/">← All labs</Link>
    <h1>Day 4: Token storage comparison</h1>
    <p>Compare three educational adapters using only Alice access tokens from the local lab API. No token values are displayed or logged. No refresh tokens are retained by any adapter.</p>
    <p><strong>No option is fully safe from XSS.</strong> Web Storage is readable by scripts on this origin. Memory avoids persistent storage, but injected JavaScript can still steal tokens in use or make authenticated requests.</p>

    <section aria-labelledby="experiment-heading">
      <h2 id="experiment-heading">Try the adapters</h2>
      <fieldset disabled={busy}>
        <legend>Where to store the next lab access token</legend>
        {ADAPTER_NAMES.map(name => <label key={name}>
          <input type="radio" name="adapter" checked={selected === name} onChange={() => setSelected(name)} /> {labels[name]}
        </label>)}
      </fieldset>
      <p>Switching adapters does not copy or clear tokens. A reload always selects memory again; the table still shows any saved storage tokens.</p>
      <div className="controls">
        <button disabled={busy} onClick={() => void issue()}>Issue lab access token</button>
        <button onClick={() => setRenders(value => value + 1)}>Rerender page</button>
        <button onClick={() => window.location.reload()}>Reload page</button>
        <a className="button-link" href="/labs/token-storage" target="_blank" rel="noopener noreferrer">Open fresh tab</a>
        <button onClick={reset}>Reset Lab Data</button>
      </div>
      <p>Rerender counter: {renders} (resets on reload).</p>
      <p role="status" aria-live="polite">{message}</p>
    </section>

    <section aria-labelledby="persistence-heading">
      <h2 id="persistence-heading">Persistence: expected behavior and current presence</h2>
      <p>“Present” means bytes are stored, not that a token is valid or authorized. The API alone validates tokens and permissions.</p>
      <div className="token-table-scroll" tabIndex={0} role="region" aria-label="Token persistence comparison">
        <table className="token-table">
          <caption>Same origin and browser profile; normal browsing unless noted</caption>
          <thead><tr><th scope="col">Adapter</th><th scope="col">Now</th><th scope="col">Rerender</th><th scope="col">Reload</th><th scope="col">Fresh tab</th><th scope="col">Browser restart</th></tr></thead>
          <tbody>
            <tr><th scope="row">Memory only — default</th><td><StoredStatus name="memory" /></td><td>Retained</td><td>Lost</td><td>Empty</td><td>Lost on fresh load</td></tr>
            <tr><th scope="row">sessionStorage — educational</th><td><StoredStatus name="sessionStorage" /></td><td>Retained</td><td>Retained in this tab</td><td>Empty with this page’s fresh-tab link</td><td>Usually lost when the session ends; browser session restore may retain it</td></tr>
            <tr><th scope="row">localStorage — educational</th><td><StoredStatus name="localStorage" /></td><td>Retained</td><td>Retained</td><td>Shared across same-origin tabs</td><td>Normally retained until cleared</td></tr>
          </tbody>
        </table>
      </div>
      <p>Duplicated tabs or tabs opened with an opener may start with a copy of sessionStorage; subsequent changes are separate. The fresh-tab link uses noopener. Browser restore, private browsing, storage blocking, and site-data clearing can change these results.</p>
      <p>To test restart: issue a token in each adapter, quit and reopen your browser, then return to this URL. Compare a fresh session with “restore previous tabs” enabled. This page does not simulate a browser restart.</p>
      <p>Reset removes only this exercise’s key. It cannot clear another tab’s memory or sessionStorage and does not revoke API tokens. Reset in each open lab tab as needed. Shared localStorage removal appears in other tabs.</p>
      <p>References: <a href="https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage">sessionStorage behavior</a> and <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API">Web Storage behavior</a>.</p>
    </section>
    <section>
      <h2>Next: Refresh token rotation</h2>
      <Link className="button-link" href="/labs/token-refresh">Test refresh A → B and retry A</Link>
    </section>
  </main>;
}
