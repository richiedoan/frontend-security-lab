// Educational access-token adapters only. Never pass a refresh token or real credentials.
export const LAB_TOKEN_KEY = "frontend-security-lab:day4:access-token";
export const ADAPTER_NAMES = ["memory", "sessionStorage", "localStorage"] as const;
export type AdapterName = (typeof ADAPTER_NAMES)[number];
export interface TokenAdapter {
  read(): string | null;
  write(accessToken: string): void;
  clear(): void;
}

export function createMemoryAdapter(): TokenAdapter {
  let token: string | null = null;
  return {
    read: () => token,
    write: (accessToken) => { token = accessToken; },
    clear: () => { token = null; },
  };
}

export function createStorageAdapter(getStorage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">): TokenAdapter {
  // Resolve lazily: SSR has no window, and browser policy may deny storage access.
  return {
    read: () => getStorage().getItem(LAB_TOKEN_KEY),
    write: (accessToken) => getStorage().setItem(LAB_TOKEN_KEY, accessToken),
    clear: () => getStorage().removeItem(LAB_TOKEN_KEY),
  };
}

export function resetLabData(adapters: Record<AdapterName, TokenAdapter>): AdapterName[] {
  const failed: AdapterName[] = [];
  for (const name of ADAPTER_NAMES) {
    try { adapters[name].clear(); } catch { failed.push(name); }
  }
  return failed;
}

// Module lifetime preserves memory across React rerenders and client navigation.
// A full reload/new document starts a fresh instance. Nothing is stored on the server.
export const adapters: Record<AdapterName, TokenAdapter> = {
  memory: createMemoryAdapter(),
  sessionStorage: createStorageAdapter(() => window.sessionStorage),
  localStorage: createStorageAdapter(() => window.localStorage),
};

export async function issueLabAccessToken(signal?: AbortSignal): Promise<string> {
  const response = await fetch("http://localhost:4000/token/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alice" }), credentials: "omit", cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("Lab login failed. Start the local API and open localhost:3000.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("access_token" in body) ||
    typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("The local API did not return an access token.");
  }
  // Discard the login response's refresh token; no adapter, React state, or log receives it.
  return body.access_token;
}
