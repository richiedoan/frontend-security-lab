import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Local Second App and Attacker Labs", description: "Separate local SSO observation and harmless attacker simulation routes" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
