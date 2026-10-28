import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey } from 'node:crypto';
import { importSPKI, jwtVerify, SignJWT } from 'jose';
import { loadTokenKey } from './token-key';

it('generates a private local key with restricted permissions and reloads it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'token-key-test-'));
  const path = join(directory, '.local/key.pem');
  try {
    const first = await loadTokenKey(path);
    const second = await loadTokenKey(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const publicPem = createPublicKey(readFileSync(path)).export({ type: 'spki', format: 'pem' }) as string;
    const publicKey = await importSPKI(publicPem, 'ES256');
    for (const key of [first, second]) {
      const token = await new SignJWT({ sub: 'alice' }).setProtectedHeader({ alg: 'ES256' }).sign(key);
      await expect(jwtVerify(token, publicKey)).resolves.toHaveProperty('payload.sub', 'alice');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
