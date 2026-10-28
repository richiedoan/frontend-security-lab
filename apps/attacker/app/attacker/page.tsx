"use client";

import Link from "next/link";
import { useState } from "react";

const API_ORIGIN = "http://localhost:4000";

export default function Home() {
  const [fetchResult, setFetchResult] = useState("No fetch attempted yet.");
  const [formResult, setFormResult] = useState("No form submitted yet.");

  async function attemptFetch(): Promise<void> {
    try {
      const response = await fetch(`${API_ORIGIN}/public`);
      const body: unknown = await response.json();
      setFetchResult(`${new Date().toISOString()} — ${response.status} ${JSON.stringify(body)}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown browser error";
      setFetchResult(`${new Date().toISOString()} — ERROR: ${detail}`);
    }
  }

  return (
    <main>
      <header>
        <p className="warning">LOCAL ATTACKER LAB — HARMLESS EDUCATIONAL SIMULATION</p>
        <h1>Day 1: Cross-Origin Requests</h1>
        <p>This page runs only on localhost and sends requests directly to the local lab API.</p>
      </header>

      <section>
        <h2>CSRF: harmless theme preference</h2>
        <Link href="/labs/csrf" prefetch={false}>Open auto-submitting CSRF form</Link>
      </section>

      <section>
        <h2>Scripted fetch</h2>
        <button onClick={() => void attemptFetch()}>Attempt GET /public</button>
        <output aria-live="polite">{fetchResult}</output>
      </section>

      <section>
        <h2>Plain HTML form</h2>
        <p>The browser can submit this form cross-origin, but the hardened API rejects it without the required session, CSRF header, and trusted Origin. The response loads into a hidden frame.</p>
        <form
          action={`${API_ORIGIN}/transfer`}
          method="post"
          target="transfer-sink"
          onSubmit={() => setFormResult(`${new Date().toISOString()} — Form submitted; response intentionally unreadable.`)}
        >
          <label>
            Harmless integer amount
            <input name="amount" type="number" min="1" max="10000" step="1" defaultValue="1" required />
          </label>
          <button type="submit">Submit form POST /transfer</button>
        </form>
        <output aria-live="polite">{formResult}</output>
        <iframe name="transfer-sink" title="Unread cross-origin transfer response" hidden />
      </section>
    </main>
  );
}
