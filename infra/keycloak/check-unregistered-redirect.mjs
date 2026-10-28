// Optional live check: fixed local endpoint, synthetic inputs, no login or cookies.
const url = new URL('http://localhost:8080/realms/lab/protocol/openid-connect/auth');
url.search = new URLSearchParams({
  client_id: 'security-web', response_type: 'code', scope: 'openid',
  redirect_uri: 'http://localhost:3000/unregistered-day05-callback',
  state: 'synthetic-negative-state', nonce: 'synthetic-negative-nonce',
  code_challenge_method: 'S256', code_challenge: 'A'.repeat(43),
}).toString();
try {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  const body = await response.text();
  if (response.status !== 400 || response.headers.has('location') ||
    !/invalid parameter:?\s*redirect_uri/i.test(body)) {
    console.error(`FAIL: redirect rejection not confirmed (HTTP ${response.status}); inspect locally without saving raw responses.`);
    process.exitCode = 1;
  } else {
    console.log('PASS: unregistered redirect rejected with HTTP 400; no redirect followed.');
  }
} catch {
  console.error('NOT VERIFIED: local Keycloak unavailable or request failed. Start the imported lab realm and retry.');
  process.exitCode = 1;
}
