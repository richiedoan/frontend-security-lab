import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Frontend Security Lab", description: "A local-only educational frontend security lab" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Nonces must come from the current request, never prerendered HTML.
  await connection();
  return (
    <html lang="en"><body>
      <a className="skip-link" href="#content">Skip to content</a>
      <div className="app-shell">
        <aside className="project-sidebar" aria-label="Project navigation">
          <Link className="project-brand" href="/">
            <span className="project-avatar" aria-hidden="true">F</span>
            <span>Frontend Security Lab<small>Learning workspace</small></span>
          </Link>
          <p className="nav-label">Project</p>
          <Link className="overview-link" href="/">Overview <span aria-hidden="true">↗</span></Link>
          <p className="nav-label">Learning path</p>
          <nav className="day-navigation" aria-label="Daily labs">
            {[
              "Browser boundary", "Session & authorization", "XSS, CSRF & CSP",
              "Tokens", "Keycloak login", "OIDC inspection",
            ].map((label, index) => (
              <Link key={label} href={`/#day-${index + 1}`}>
                <span className="nav-day">{String(index + 1).padStart(2, "0")}</span>
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="status-dot" aria-hidden="true" /> Local learning environment
            <p>Explore the boundaries.<br />Understand the controls.</p>
          </div>
        </aside>
        <div className="workspace">
          <header className="workspace-header">
            <Link href="/">Security labs</Link><span aria-hidden="true">/</span>
            <span>Frontend Security Lab</span><span className="environment-badge">Local lab</span>
          </header>
          <div id="content" tabIndex={-1}>{children}</div>
        </div>
      </div>
    </body></html>
  );
}
