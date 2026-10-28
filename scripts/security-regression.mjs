import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, NODE_ENV: 'test', LAB_INSECURE_AUTHZ: 'false',
  LAB_INSECURE_CSRF: 'false', LAB_INSECURE_CORS: 'false', FORCE_COLOR: '0', NO_COLOR: '1' };
delete env.CSP_MODE;
const steps = [
  ['web', 'yarn', ['workspace', '@frontend-security-lab/web', 'test']],
  ['second-app', 'yarn', ['workspace', '@frontend-security-lab/attacker', 'test']],
  ['api', 'yarn', ['workspace', '@frontend-security-lab/api', 'test', '--runInBand', '--json']],
  ['realm-static', process.execPath, ['infra/keycloak/validate-realm.mjs']],
];
let failed = false;
for (const [name, command, args] of steps) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${name} (exit ${result.status ?? 'unavailable'})`);
  // Allowlist numeric summaries only. Never publish test diagnostics, request
  // bodies, JWTs, cookies, callback URLs, or raw stdout/stderr as artifacts.
  for (const line of output.split('\n')) {
    const summary = line.replace(/^[ℹ\s]+/u, '').trim();
    if (/^(?:tests|pass|fail|cancelled|skipped|todo) \d+$/.test(summary)
      || /^(?:Test Suites|Tests):\s+[\d\s,a-z]+$/.test(summary)) console.log(`  ${summary}`);
  }
  if (result.status !== 0) {
    failed = true;
    const json = (result.stdout ?? '').split('\n').find(line => line.startsWith('{"numFailedTestSuites":'));
    if (json) {
      const report = JSON.parse(json);
      for (const suite of report.testResults ?? []) {
        const path = String(suite.name).replace(cwd, '');
        if (!/^apps\/api\/[a-zA-Z0-9/_.-]+\.ts$/.test(path)) continue;
        for (const [index, assertion] of (suite.assertionResults ?? []).entries()) {
          if (assertion.status === 'failed') console.log(`  Failed assertion ${index + 1} in ${path}`);
        }
      }
    }
    console.log(`  Diagnostics withheld to protect credentials. Reproduce locally: ${command} ${args.join(' ')}`);
  }
}
console.log('Live Keycloak and browser enforcement checks: NOT RUN (see security-test-report.md).');
process.exitCode = failed ? 1 : 0;
