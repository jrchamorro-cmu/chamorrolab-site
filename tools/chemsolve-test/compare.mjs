// Run every case through the original PHP (php-wasm) and the JS port; compare field by field.
// Usage: node compare.mjs cases.json [more.json ...]
import { bootPHP, runPHP } from './php.mjs';
import fs from 'fs';
import { createRequire } from 'module';
const CS = createRequire(import.meta.url)('../../assets/js/chemsolve.js');
const files = process.argv.slice(2);
const cases = files.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const php = await bootPHP();
const phpOut = JSON.parse(await runPHP(php, fs.readFileSync(new URL('./driver.php', import.meta.url), 'utf8'),
  { '/tmp/cases.json': JSON.stringify(cases) }));
const decode = ([t, s]) => s === 'NaN' ? NaN : s === 'Infinity' ? Infinity : s === '-Infinity' ? -Infinity : Number(s);
const relOK = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
let pass = 0, exactMass = 0, nMass = 0; const fails = [], notices = {};
cases.forEach((c, i) => {
  const P = phpOut[i];
  const J = CS.solve(c.target, c.source, c.dummy, c.amount, c.quantType);
  const diffs = [];
  if (P.fatal || J.fatal) { if (P.fatal !== J.fatal) diffs.push(['fatal', P.fatal, J.fatal]); }
  else {
    for (const k of ['ok', 'reaction', 'mw']) if (P[k] !== J[k]) diffs.push([k, P[k], J[k]]);
    for (const k of ['warnings', 'errors']) if (JSON.stringify(P[k]) !== JSON.stringify(J[k])) diffs.push([k, P[k], J[k]]);
    if (P.rows.length !== J.rows.length) diffs.push(['rows.length', P.rows.length, J.rows.length]);
    else P.rows.forEach((pr, r) => {
      const jr = J.rows[r], pm = decode(pr[1]);
      nMass++; if (Object.is(pm, jr[1])) exactMass++;
      if (pr[0] !== jr[0]) diffs.push([`row${r}.name`, pr[0], jr[0]]);
      if (!relOK(pm, jr[1])) diffs.push([`row${r}.mg`, pm, jr[1]]);
      if (pr[2] !== jr[2]) diffs.push([`row${r}.str`, pr[2], jr[2]]);
    });
  }
  for (const n of P.notices) notices[n] = (notices[n] || 0) + 1;
  if (diffs.length) fails.push({ id: c.id, case: c, diffs }); else pass++;
});
for (const f of fails) console.log('FAIL', f.id, JSON.stringify(f.case), '\n  ' + f.diffs.map(d => JSON.stringify(d)).join('\n  '));
console.log(`\n${pass}/${cases.length} cases match; masses bit-identical ${exactMass}/${nMass}; fatal in PHP: ${phpOut.filter(p => p.fatal).length}; ok in PHP: ${phpOut.filter(p => p.ok).length}`);
console.log('PHP notices seen (not compared):', notices);
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(cases.map((c, i) => ({ ...c, php: phpOut[i] })), null, 1));
process.exit(fails.length ? 1 : 0);
