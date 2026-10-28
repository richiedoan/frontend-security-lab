"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Comment } from "../../../comment-list";
import {
  clearExecutionMarker, clearStorageMarker, EXECUTION_PAYLOAD,
  STORAGE_PAYLOAD, FAKE_MARKER_VALUE, type DemoKind,
} from "./demo";

import { labFetch } from "../../../lab-fetch";

function DemoSection({ kind }: { kind: DemoKind }) {
  const isStorage = kind === "storage";
  const payload = isStorage ? STORAGE_PAYLOAD : EXECUTION_PAYLOAD;
  const emptyResult = isStorage ? "not read" : "not executed";
  const [comments, setComments] = useState<Comment[]>([]);
  const [message, setMessage] = useState("Sign in on the home page first.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(emptyResult);

  useEffect(() => {
    if (isStorage) delete document.body.dataset.xssLabValue;
    else clearExecutionMarker(document.body.dataset);
    return () => {
      if (isStorage) {
        delete document.body.dataset.xssLabValue;
        try { localStorage.removeItem("xssLabMarker"); } catch { /* Storage may be blocked. */ }
      } else clearExecutionMarker(document.body.dataset);
    };
  }, [isStorage]);

  function clearLocalDemo() {
    setComments([]);
    setResult(emptyResult);
    if (isStorage) clearStorageMarker(document.body.dataset, localStorage);
    else clearExecutionMarker(document.body.dataset);
  }

  function seedFakeMarker() {
    try {
      clearLocalDemo();
      localStorage.setItem("xssLabMarker", FAKE_MARKER_VALUE);
      setMessage("Fake key set. Load the storage demo to read it through XSS.");
    } catch {
      setMessage("Local storage is unavailable. Allow local storage for this local lab.");
    }
  }

  async function run(store: boolean) {
    setBusy(true);
    try {
      if (store) {
        const response = await labFetch("/comments", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: payload }),
        });
        if (!response.ok) throw new Error(`Could not store comment (${response.status}). Sign in on the home page.`);
      }
      const response = await labFetch("/comments", { credentials: "include" });
      if (!response.ok) throw new Error(`Could not load comments (${response.status}). Sign in on the home page.`);
      const data = await response.json() as { comments: Comment[] };
      setComments(data.comments.filter((comment) => comment.text === payload));
      setMessage("Loaded only this demo’s comments. Check the result after rendering.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeStoredDemo() {
    setBusy(true);
    try {
      const response = await labFetch(`/comments/xss-demo/${kind}`, {
        method: "DELETE", credentials: "include",
      });
      if (!response.ok) throw new Error(`Could not delete demo comments (${response.status}). Sign in and try again.`);
      const data = await response.json() as { deleted: number };
      clearLocalDemo();
      setMessage(`Deleted ${data.deleted} comment(s) for this demo. Other comments were kept.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${kind}-heading`}>
      <h2 id={`${kind}-heading`}>{isStorage ? "Demo 2: Read fake localStorage" : "Demo 1: Execute JavaScript"}</h2>
      {isStorage ? (
        <p>Set <code>xssLabMarker</code> to <code>{FAKE_MARKER_VALUE}</code>, then load this demo.
          Its payload only reads that fake key into a separate DOM marker. Never put real data in this key.</p>
      ) : <p>This payload only sets <code>{'document.body.dataset.xssLab = "executed"'}</code>.</p>}
      <pre>{payload}</pre>
      <div className="controls">
        {isStorage && <button disabled={busy} onClick={seedFakeMarker}>Set fake localStorage marker</button>}
        <button disabled={busy} onClick={() => void run(true)}>Store demo comment and load</button>
        <button disabled={busy} onClick={() => void run(false)}>Load stored comments</button>
        <button disabled={busy} onClick={() => setResult(
          (isStorage ? document.body.dataset.xssLabValue : document.body.dataset.xssLab) ?? emptyResult,
        )}>{isStorage ? "Show value read by XSS" : "Check execution marker"}</button>
        <button disabled={busy} onClick={() => {
          try {
            clearLocalDemo();
            setMessage("Cleared this demo’s local data. Stored comments remain.");
          } catch {
            setMessage("Rendered demo cleared, but browser settings prevented localStorage cleanup.");
          }
        }}>Clear local demo data</button>
        <button disabled={busy} onClick={() => void removeStoredDemo()}>Delete this demo’s stored comments</button>
      </div>
      <p aria-live="polite">{message}</p>
      <p>{isStorage ? "Value read by XSS" : "Execution marker"}: <output>{result}</output></p>
      <ul>
        {comments.map((comment) => (
          <li key={comment.id}>
            <strong>{comment.authorId}</strong>
            {comment.text === payload ? (
              // Only this section's exact fixed payload reaches the unsafe sink.
              <div dangerouslySetInnerHTML={{ __html: comment.text }} />
            ) : <p>{comment.text}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function InsecureXssLab() {
  return (
    <main>
      <h1>Insecure stored XSS lab</h1>
      <p className="lab-warning" role="alert"><strong>Warning: intentionally unsafe HTML rendering. LOCAL LAB ONLY.</strong></p>
      <p>Two independent exercises use fixed harmless payloads. Neither reads or transmits real cookies,
        tokens, credentials, files, clipboard contents, or network data.
        The page uses your local lab session for ordinary comment API requests.</p>
      <DemoSection kind="execution" />
      <DemoSection kind="storage" />
      <section>
        <h2>Why this is dangerous</h2>
        <p>React text children display strings as text, escaping HTML characters. The normal comments page
          therefore displays both payloads literally.</p>
        <p><code>dangerouslySetInnerHTML</code> asks the browser to parse a string as HTML.
          Event handlers can execute JavaScript with the page’s privileges, including access to same-origin
          localStorage. Different URL paths do not isolate storage.</p>
        <p>Each section renders only its own exact payload as HTML. The storage payload never sets the
          execution marker, and the execution payload never accesses storage. Captured values render as React text.</p>
        <p>The exact-match restriction contains this exercise; it is not a general HTML sanitization strategy.</p>
        <Link href="/">Return to secure comments</Link>
      </section>
    </main>
  );
}
