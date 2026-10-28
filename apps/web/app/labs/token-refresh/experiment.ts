export type RefreshStep = "login" | "rotate" | "retry" | "check";
export interface RefreshObservation {
  step: RefreshStep;
  status: number;
  expected: number;
  passed: boolean;
}
const steps: RefreshStep[] = ["login", "rotate", "retry", "check"];

// Explicit educational exception: retain A and B only in this page's memory to replay A.
// Never expose token values to UI output, logs, URLs, or browser storage.
export function createRefreshExperiment() {
  let a: string | null = null;
  let b: string | null = null;
  let index = 0;
  let busy = false;
  let stopped = false;
  const controller = new AbortController();
  return {
    clear() {
      stopped = true;
      controller.abort();
      a = null;
      b = null;
    },
    async run(step: RefreshStep): Promise<RefreshObservation> {
      if (stopped || busy || steps[index] !== step) throw new Error("Start a new experiment and follow the steps in order.");
      busy = true;
      try {
        const response = await fetch(`http://localhost:4000/token/${step === "login" ? "login" : "refresh"}`, {
          method: "POST", credentials: "omit", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(step === "login" ? { username: "alice" } : { refresh_token: step === "check" ? b : a }),
        });
        if (controller.signal.aborted) throw new Error("Experiment cleared.");
        const expected = step === "login" || step === "rotate" ? 200 : 401;
        const passed = response.status === expected;
        if (passed && expected === 200) {
          const body: unknown = await response.json();
          if (controller.signal.aborted) throw new Error("Experiment cleared.");
          if (!body || typeof body !== "object" || !("refresh_token" in body) ||
            typeof body.refresh_token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.refresh_token)) {
            throw new Error("Invalid lab response. Start a new experiment.");
          }
          if (step === "login") a = body.refresh_token;
          else {
            if (body.refresh_token === a) throw new Error("Rotation did not produce a new token. Start a new experiment.");
            b = body.refresh_token;
          }
          // Access tokens are not needed for this exercise and are discarded.
        }
        if (passed) index++;
        else stopped = true;
        return { step, status: response.status, expected, passed };
      } catch {
        // A failed network response may still have consumed A on the server. Never auto-retry.
        stopped = true;
        throw new Error("Request incomplete. Check the local API and start a new experiment; the server may already have consumed A.");
      } finally { busy = false; }
    },
  };
}
