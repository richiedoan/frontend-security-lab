import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const marker = 'DAY05_FAKE_PUBLIC_MARKER_NOT_A_CREDENTIAL_7f392a';
const generatedTypes = join(root, 'next-env.d.ts');
const previousTypes = readFileSync(generatedTypes);
try {
  const build = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_LAB_BUNDLE_MARKER: marker },
  });
  if (build.status !== 0) throw new Error('Production build failed');
  function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    });
  }
  const matches = files(join(root, '.next/static')).filter(path =>
    path.endsWith('.js') && readFileSync(path, 'utf8').includes(marker));
  if (!matches.length) throw new Error('Fake marker missing from browser JavaScript');
  console.log('PASS: fixed fake marker found in production browser JavaScript:');
  for (const path of matches) console.log(relative(root, path));
  console.log('Only filenames reported; no bundle contents or credentials printed.');
} finally {
  writeFileSync(generatedTypes, previousTypes);
}
