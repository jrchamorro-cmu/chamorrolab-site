// Shared helper: boot php-wasm (PHP 8.3) with the ORIGINAL chemsolve sources in /cs.
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import fs from 'fs';
import path from 'path';
const SRC = new URL('./upstream/', import.meta.url).pathname;
export async function bootPHP(ver = process.env.PHPV || '8.3') {
  const php = new PHP(await loadNodeRuntime(ver, { emscriptenOptions: { processId: 1 } }));
  php.mkdir('/cs');
  for (const f of fs.readdirSync(SRC)) if (/\.phpi?$/.test(f)) php.writeFile('/cs/' + f, fs.readFileSync(path.join(SRC, f)));
  return php;
}
export async function runPHP(php, code, inputs = {}) {
  for (const [k, v] of Object.entries(inputs)) php.writeFile(k, v);
  php.writeFile('/cs/__run.php', code);
  const r = await php.run({ scriptPath: '/cs/__run.php' });
  if (r.errors) process.stderr.write(r.errors);
  return r.text;
}
