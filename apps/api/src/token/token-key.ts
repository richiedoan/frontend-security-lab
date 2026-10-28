import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { importPKCS8 } from 'jose';

export const TOKEN_PUBLIC_KEY = Symbol('TOKEN_PUBLIC_KEY');
export const TOKEN_KEY = Symbol('TOKEN_KEY');
export const TOKEN_ALGORITHM = 'ES256';

// Local teaching key only. Never commit, print, or return private key material.
export async function loadTokenKey(
  path = resolve(__dirname, '../../.local/token-signing-key.pem'),
): Promise<CryptoKey> {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    try {
      writeFileSync(path, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
        flag: 'wx', mode: 0o600,
      });
    } catch (writeError) {
      // Another local process may have created the key first; use its key.
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
    }
  }
  // Allow deriving the verification public key through Node's KeyObject API.
  // The private key stays in this local process and the gitignored file.
  return importPKCS8(readFileSync(path, 'utf8'), TOKEN_ALGORITHM, { extractable: true });
}
