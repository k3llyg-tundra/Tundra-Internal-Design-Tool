import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../plugins/delivery-export/', import.meta.url));
const tests = readdirSync(cwd).filter(name => name.endsWith('.test.js')).sort();
if (!tests.length) throw new Error('No Delivery Export regression scripts found');
for (const test of tests) {
  const result = spawnSync(process.execPath, [test], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
