"use client";

import { useState } from "react";
import Link from "next/link";

import { labFetch } from "./lab-fetch";
const LAB_USERS = ["alice", "bob", "admin"] as const;

interface LabUser {
  id: (typeof LAB_USERS)[number];
  displayName: string;
  role: "user" | "admin";
}

interface LabDocument {
  id: string;
  title: string;
  ownerId: string;
  editorIds: string[];
  viewerIds: string[];
}

interface Result {
  status: "success" | "error";
  detail: string;
  timestamp: string;
}

export default function Home() {
  const [amount, setAmount] = useState(1);
  const [currentUser, setCurrentUser] = useState<LabUser>();
  const [documentId, setDocumentId] = useState("alice-plan");
  const [title, setTitle] = useState("Updated local lab title");
  const [document, setDocument] = useState<LabDocument>();
  const [result, setResult] = useState<Result>();

  async function callApi(path: string, init?: RequestInit): Promise<{ ok: boolean; body: unknown }> {
    try {
      const response = await labFetch(path, init);
      const text = await response.text();
      const body: unknown = text ? JSON.parse(text) : null;
      setResult({
        status: response.ok ? "success" : "error",
        detail: `${response.status} ${text || "No response body"}`,
        timestamp: new Date().toISOString(),
      });
      return { ok: response.ok, body };
    } catch (error) {
      setResult({
        status: "error",
        detail: error instanceof Error ? error.message : "Unknown browser error",
        timestamp: new Date().toISOString(),
      });
      return { ok: false, body: null };
    }
  }

  async function login(username: LabUser["id"]): Promise<void> {
    const result = await callApi("/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (result.ok) setCurrentUser((result.body as { user: LabUser }).user);
  }

  async function loadCurrentUser(): Promise<void> {
    const result = await callApi("/session/me");
    setCurrentUser(result.ok ? (result.body as { user: LabUser }).user : undefined);
  }

  async function logout(): Promise<void> {
    const result = await callApi("/session/logout", { method: "POST" });
    if (!result.ok) return;
    setCurrentUser(undefined);
    setDocument(undefined);
  }

  async function loadDocument(): Promise<void> {
    const result = await callApi(`/documents/${encodeURIComponent(documentId)}`);
    setDocument(result.ok ? result.body as LabDocument : undefined);
  }

  async function updateDocument(): Promise<void> {
    const result = await callApi(`/documents/${encodeURIComponent(documentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (result.ok) setDocument(result.body as LabDocument);
  }

  const canEditLoadedDocument = currentUser && document && (
    currentUser.role === "admin" ||
    document.ownerId === currentUser.id ||
    document.editorIds.includes(currentUser.id)
  );

  return (
    <main className="overview-page">
      <div className="project-intro">
        <p className="eyebrow">SECURITY / IDENTITY / TRUST</p>
        <h1>Frontend Security Lab</h1>
        <p>A hands-on workspace for browser security, identity, and access control.</p>
        <div className="project-tags"><span>6 days of exploration</span><span>Local experiments</span></div>
      </div>

      <section id="day-1">
        <h2><span className="day-number"><span className="sr-only">Day </span>01</span> Browser boundary</h2>
        <p>These controls call the API directly across origins without a proxy or rewrite.</p>
        <div className="controls">
          <button onClick={() => void callApi("/public")}>GET /public</button>
          <button onClick={() => void callApi("/private")}>GET /private without header</button>
          <button onClick={() => void callApi("/private", { headers: { "x-lab-user": "local-lab-user" } })}>
            GET /private with x-lab-user
          </button>
        </div>
        <label>
          Harmless integer amount
          <input type="number" min="1" max="10000" step="1" value={amount} onChange={(event) => setAmount(event.target.valueAsNumber)} />
        </label>
        <button onClick={() => void callApi("/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        })}>
          POST /transfer
        </button>
      </section>

      <section id="day-2">
        <h2><span className="day-number"><span className="sr-only">Day </span>02</span> Session and authorization</h2>
        <p>Button visibility is UX only. The API session guard and policy service make every authorization decision.</p>
        <div className="controls">
          {LAB_USERS.map((username) => (
            <button key={username} onClick={() => void login(username)}>Login as {username}</button>
          ))}
          <button onClick={() => void loadCurrentUser()}>GET /session/me</button>
          {currentUser && <button onClick={() => void logout()}>Logout</button>}
        </div>
        <p>Current user: <strong>{currentUser ? `${currentUser.displayName} (${currentUser.role})` : "none"}</strong></p>

        {currentUser && (
          <div className="lab-panel">
            <label>
              Document ID
              <input value={documentId} onChange={(event) => setDocumentId(event.target.value)} />
            </label>
            <button onClick={() => void loadDocument()}>GET document</button>
            {document && <pre>{JSON.stringify(document, null, 2)}</pre>}

            {canEditLoadedDocument && (
              <div>
                <label>
                  New title
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <button onClick={() => void updateDocument()}>PATCH document</button>
              </div>
            )}

            {currentUser.role === "admin" && (
              <button onClick={() => void callApi("/admin/audit")}>GET admin audit</button>
            )}
          </div>
        )}
      </section>

      <section id="day-3">
        <h2><span className="day-number"><span className="sr-only">Day </span>03</span> XSS, CSRF &amp; CSP</h2>
        <h3>Content Security Policy</h3>
        <Link className="button-link" href="/labs/csp">Open local CSP resource demo</Link>
        <h3>Stored XSS</h3>
        <p>Explore stored XSS in the intentionally insecure local demo.</p>
        <Link className="button-link" href="/labs/xss/insecure">Open insecure XSS lab</Link>

        <h3>CSRF: Theme preference</h3>
        <p>Sign in above. Inspect the saved preference before and after visiting the local attacker form.</p>
        <button onClick={() => void callApi("/profile/theme")}>GET saved theme</button>
        {(["light", "dark"] as const).map((theme) => (
          <button key={theme} onClick={() => void callApi("/profile/theme", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme }),
          })}>Set theme to {theme}</button>
        ))}
        <p><a href="http://localhost:3001/labs/csrf" target="_blank" rel="noreferrer">Open local CSRF form (auto-submits theme=dark)</a></p>
      </section>

      <section id="day-4">
        <h2><span className="day-number"><span className="sr-only">Day </span>04</span> Tokens</h2>
        <Link className="button-link" href="/labs/token-storage">Compare token storage adapters</Link>
        <Link className="button-link" href="/labs/token-refresh">Test refresh A → B and retry A</Link>
      </section>

      <section id="day-5">
        <h2><span className="day-number"><span className="sr-only">Day </span>05</span> Keycloak login</h2>
        <Link className="button-link" href="/labs/oidc">Sign in with Keycloak</Link>
      </section>

      <section id="day-6">
        <h2><span className="day-number"><span className="sr-only">Day </span>06</span> OIDC inspection</h2>
        <Link className="button-link" href="/labs/oidc#inspection">Inspect selected OIDC claims</Link>
      </section>

      <section className="result-panel" aria-live="polite">
        <h2>Latest result</h2>
        {result ? (
          <output className={result.status}>
            <strong>{result.status.toUpperCase()}</strong>
            <span>{result.detail}</span>
            <time dateTime={result.timestamp}>{result.timestamp}</time>
          </output>
        ) : <p>No request attempted yet.</p>}
      </section>
    </main>
  );
}
