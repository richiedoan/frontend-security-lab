"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SAMPLE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="green"/%3E%3C/svg%3E';

export default function CspLab() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState("No resource attempted.");
  const [violation, setViolation] = useState("No violation observed.");
  useEffect(() => {
    const handler = (event: SecurityPolicyViolationEvent) => {
      if (event.effectiveDirective === "img-src" && event.blockedURI === "data") {
        setViolation(`${event.disposition}: img-src does not allow this data: image.`);
      }
    };
    document.addEventListener("securitypolicyviolation", handler);
    return () => document.removeEventListener("securitypolicyviolation", handler);
  }, []);
  return (
    <main>
      <h1>Local CSP resource demo</h1>
      <p>This harmless green square is an inline data URL. No external request, cookies, or storage access is involved.</p>
      <p>With CSP_MODE=report-only the image loads and a violation is reported. With CSP_MODE=enforce it is blocked by img-src.</p>
      <button onClick={() => { setResult("Loading…"); setViolation("Waiting for a violation event."); setAttempt((value) => value + 1); }}>Try harmless image</button>
      {attempt > 0 && (
        // A raw image intentionally exercises browser CSP, without Next image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={attempt} src={SAMPLE} alt="Harmless green square" width={80} height={80}
          onLoad={() => setResult("Image loaded.")} onError={() => setResult("Image blocked or failed. Check the CSP event and DevTools." )} />
      )}
      <p role="status">{result}</p>
      <p>{violation}</p>
      <p>Open DevTools → Network → this document → Response Headers to verify the CSP header. Use Console to inspect img-src violations. Without CSP_MODE, the image loads without a policy violation.</p>
      <Link href="/">Return to Day 3</Link>
    </main>
  );
}
