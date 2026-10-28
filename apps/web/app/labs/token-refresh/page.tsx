"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createRefreshExperiment, type RefreshObservation, type RefreshStep } from "./experiment";

const actions: { step: RefreshStep; label: string; explanation: string }[] = [
  { step: "login", label: "1. Create A", explanation: "Log in as Alice → HTTP 200. Keep refresh token A in memory." },
  { step: "rotate", label: "2. Refresh A → B", explanation: "Send A → HTTP 200. A is consumed; the API returns a new refresh token B." },
  { step: "retry", label: "3. Retry A", explanation: "Send the same A again → HTTP 401. Reuse revokes the entire token family, including B." },
  { step: "check", label: "4. Check B", explanation: "Send B → HTTP 401. Confirm that B can no longer refresh after retrying A." },
];

export default function RefreshLab() {
  const experiment = useRef<ReturnType<typeof createRefreshExperiment> | null>(null);
  const [observations, setObservations] = useState<RefreshObservation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { experiment.current?.clear(); experiment.current = null; }, []);

  async function run(step: RefreshStep) {
    const active = experiment.current ??= createRefreshExperiment();
    setBusy(true);
    try {
      const result = await active.run(step);
      if (experiment.current !== active) return;
      setObservations(previous => [...previous, result]);
      if (!result.passed) setError("Unexpected HTTP status. Reset and start again; check the API and refresh-family expiry.");
    } catch {
      if (experiment.current === active) setError("Request incomplete. Check the API at localhost:4000 and open this page at localhost:3000. Reset to try again; the server may already have consumed A, so this page does not retry automatically.");
    } finally {
      if (experiment.current === active) setBusy(false);
    }
  }

  function reset() {
    experiment.current?.clear();
    experiment.current = null;
    setObservations([]);
    setError("");
    setBusy(false);
  }

  return <main>
    <Link href="/">← All labs</Link>
    <h1>Day 4: Refresh A → B and retry A</h1>
    <p>Test the local API as Alice. Follow the four steps in order; the results below show actual HTTP statuses from the server.</p>
    <p><strong>For lab use only.</strong> This page deliberately retains the consumed token A to demonstrate reuse. A and B stay only in page memory and are discarded on reset, reload, or navigation away. Token values are never displayed, logged, or written to sessionStorage/localStorage.</p>
    <p>Memory is not fully safe from XSS. The default storage comparison page still retains no refresh tokens.</p>
    <section>
      <h2>Follow the steps in order</h2>
      <ol>
        {actions.map((action, index) => <li key={action.step}>
          <button disabled={busy || Boolean(error) || observations.length !== index} onClick={() => void run(action.step)}>{action.label}</button>
          <p>{action.explanation}</p>
        </li>)}
      </ol>
      <button onClick={reset}>Reset Lab Data / Start again</button>
      <p>Reset only discards client-side token copies; it does not log out or revoke the family. Creating a new A starts an independent family.</p>
    </section>
    <section aria-live="polite" aria-busy={busy}>
      <h2>Observed results</h2>
      {busy && <p role="status">Sending request…</p>}
      {error && <p role="alert">{error}</p>}
      {observations.length === 0 && !busy && <p>No requests yet. Start with “1. Create A”.</p>}
      <ol>{observations.map(result => <li key={result.step}>
        {actions.find(action => action.step === result.step)?.label}: <strong>HTTP {result.status}</strong>
        {result.passed ? " — as expected" : ` — expected HTTP ${result.expected}`}
      </li>)}</ol>
      {observations.length === 4 && observations.every(result => result.passed) && <p><strong>Complete:</strong> A → B succeeded; retrying A was rejected, and B was also rejected. Run the steps consecutively within one API session to avoid confusing reuse detection with family expiry or a server restart.</p>}
    </section>
    <section>
      <h2>What this demonstrates</h2>
      <p>The API uses strict reuse detection: retrying A after success revokes the entire family, even if the client retries because it lost the response. There is no retry grace period.</p>
      <p>Revoking a refresh family does not immediately invalidate issued access tokens. They remain usable until their five-minute expiry. This page tests refresh only and does not retain access tokens.</p>
      <Link href="/labs/token-storage">Compare memory / sessionStorage / localStorage</Link>
    </section>
  </main>;
}
