export default function Home() {
  return <main>
    <h1>Local labs on port 3001</h1>
    <section><h2>Second application: SSO observation</h2>
      <p>A separate OIDC client with its own login transaction and in-memory session.</p>
      <a href="/second-app">Open second app</a>
    </section>
    <section><h2>Attacker simulation</h2>
      <p>Harmless cross-origin request demonstrations for the local security lab.</p>
      <a href="/attacker">Open attacker lab</a>
    </section>
  </main>;
}
