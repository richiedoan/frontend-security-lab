export type CspMode = "report-only" | "enforce";

export function readCspMode(value: string | undefined): CspMode | undefined {
  if (!value) return undefined;
  if (value === "report-only" || value === "enforce") return value;
  throw new Error("CSP_MODE must be report-only or enforce (or unset)");
}

export function buildCsp(development: boolean, nonce: string): string {
  return [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    development ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : `script-src 'self' 'nonce-${nonce}'`,
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self'",
    `connect-src 'self' http://localhost:4000 http://localhost:8080${development ? " ws://localhost:3000 ws://127.0.0.1:3000" : ""}`,
  ].join('; ');
}
