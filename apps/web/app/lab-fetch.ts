const API_ORIGIN = "http://localhost:4000";

// Tokens stay in memory for the request, never in URLs or browser storage.
export async function labFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && path !== "/session/login") {
    const response = await fetch(`${API_ORIGIN}/session/csrf`, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("Sign in again to perform this action.");
    const { csrfToken } = await response.json() as { csrfToken: string };
    headers.set("X-CSRF-Token", csrfToken);
  }
  return fetch(`${API_ORIGIN}${path}`, { ...init, headers, credentials: "include" });
}
