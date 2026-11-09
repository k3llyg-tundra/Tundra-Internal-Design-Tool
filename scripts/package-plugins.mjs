import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'releases');
const plugins = ['component-setup', 'delivery-export', 'bulk-resize'];
const github = 'https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/blob/main/';
const temporary = await mkdtemp(join(tmpdir(), 'tundra-packages-'));

async function validateRuntime(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  for (const field of ['main', 'ui']) {
    const name = manifest[field];
    if (typeof name !== 'string' || !name || isAbsolute(name)) throw new Error(`Invalid ${field} in ${directory}`);
    const target = resolve(directory, name);
    const path = relative(directory, target);
    if (path === '..' || path.startsWith(`..${sep}`)) throw new Error(`Runtime escapes plugin: ${name}`);
    if (!(await readFile(target)).length) throw new Error(`Empty runtime: ${name}`);
  }
  return manifest;
}

try {
  await mkdir(output, { recursive: true });
  for (const slug of plugins) {
    const source = join(root, 'plugins', slug);
    const manifest = await validateRuntime(source);
    const directory = join(temporary, slug);
    await mkdir(directory);
    for (const name of new Set(['manifest.json', manifest.main, manifest.ui])) {
      await mkdir(dirname(join(directory, name)), { recursive: true });
      await cp(join(source, name), join(directory, name));
    }
    // Keep README links useful when opened outside the source repository.
    const guide = (await readFile(join(source, 'README.md'), 'utf8')).replace(
      /\]\((\.{1,2}\/[^)]+)\)/g,
      (_, target) => `](${github}${relative(root, resolve(source, target)).split(sep).join('/')})`
    );
    await writeFile(join(directory, 'README.md'), guide);
    if (slug === 'delivery-export') {
      await cp(join(source, 'vendor-licenses'), join(directory, 'vendor-licenses'), { recursive: true });
    }
    if (slug === 'bulk-resize') {
      await cp(join(source, 'src/vendor/fflate-LICENSE.txt'), join(directory, 'fflate-LICENSE.txt'));
    }
    const archive = join(output, `${slug}.zip`);
    await rm(archive, { force: true });
    execFileSync('zip', ['-q', '-r', archive, slug], { cwd: temporary });
    execFileSync('unzip', ['-t', archive], { stdio: 'pipe' });
    const extracted = join(temporary, `verify-${slug}`);
    await mkdir(extracted);
    execFileSync('unzip', ['-q', archive, '-d', extracted]);
    await validateRuntime(join(extracted, slug));
    console.log(`Packaged and verified releases/${slug}.zip`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
