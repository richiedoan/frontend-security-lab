import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, readCspMode } from "./csp";

export function proxy(request: NextRequest) {
  const mode = readCspMode(process.env.CSP_MODE);
  if (!mode) return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = buildCsp(process.env.NODE_ENV === "development", nonce);
  const requestHeaders = new Headers(request.headers);
  // Next.js reads this internal request header to nonce its generated scripts.
  // Report-only still needs this hint; it is not an enforcing response header.
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", policy);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
