// End-to-end check of the ChemSolve PAGE (not just chemsolve.js): types each case into the
// built page in headless Chrome, reads what the page displays, and compares it with the
// original PHP run on the same input after chemsolve.php's own input filters.
// Needs: python3 serve.py 8000 running in the repo, Chrome, and the setup in README.md.
// Usage: node --experimental-websocket e2e.mjs cases.json tricky.json [more.json ...]
import { bootPHP, runPHP } from './php.mjs';
import fs from 'fs';
import { spawn } from 'child_process';
const files = process.argv.slice(2);
const cases = files.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
// chemsolve.php web branch: sanitize_paranoid_string / sanitize_paranoid_tokens
const s1 = s => s.replace(/[^a-zA-Z0-9.,()_]/g, ''), s2 = s => s.replace(/[^a-zA-Z0-9.,=]/g, '');
const clean = cases.map(c => ({ ...c, target: s1(c.target ?? ''), source: s1(c.source ?? ''),
  dummy: s2(c.dummy ?? ''), amount: s1(c.amount ?? ''), quantType: String(c.quantType) === '2' ? '2' : '1' }));
const php = await bootPHP();
const P = JSON.parse(await runPHP(php, fs.readFileSync(new URL('./driver.php', import.meta.url), 'utf8'),
  { '/tmp/cases.json': JSON.stringify(clean) }));

const prof = fs.mkdtempSync('/tmp/cs-e2e-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); await sleep(2500);
const t = await (await fetch('http://127.0.0.1:9334/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result.value;
await send('Page.navigate', { url: 'http://localhost:8000/chemsolve.html' }); await sleep(1500);
await ev(`document.getElementById('gatepass').value='slowcool';document.getElementById('gateform').requestSubmit();1`); await sleep(500);
const shown = JSON.parse(await ev(`JSON.stringify(${JSON.stringify(cases)}.map(c => {
  const $ = id => document.getElementById(id);
  $('cs-target').value = c.target ?? ''; $('cs-source').value = c.source ?? ''; $('cs-dummy').value = c.dummy ?? '';
  $('cs-amount').value = c.amount ?? ''; $('cs-qtype').value = String(c.quantType) === '2' ? '2' : '1';
  $('csform').requestSubmit();
  const ok = !$('cs-out').hidden;
  return { ok, reaction: ok ? $('cs-reaction').textContent : '', mw: ok ? $('cs-mw').textContent : '',
    rows: ok ? [...$('cs-rows').rows].map(r => [r.cells[0].innerHTML, r.cells[1].textContent]) : [],
    msgs: $('cs-msgs').hidden ? [] : [...$('cs-msgs').children].map(p => p.innerHTML) };
}))`));
ws.close(); chrome.kill();

const norm = h => h.replace(/<(\/?)([a-z]+)>/gi, (m, s, t) => `<${s}${t.toLowerCase()}> (${skipped} unit-removal cases skipped, see hydrates.mjs)`);
let pass = 0; const fails = [];
// Cases whose do-not-balance list removes a unit outright ("H2O=", "NH4=") and where the PHP
// finds no answer are skipped: the
// PHP mishandles them and chemsolve.js fixes that on purpose (see make_flat). hydrates.mjs
// checks those cases against hand-calculated masses instead.
const PHPOUT = typeof phpOut !== "undefined" ? phpOut : P;
const INTENDED = c => /[A-Za-z0-9)]=(,|$)/.test(String(c.dummy ?? '').replace(/[^a-zA-Z0-9.,=]/g, ''));
let skipped = 0;
cases.forEach((c, i) => {
  if (INTENDED(c) && !(PHPOUT[i].ok)) { skipped++; return; }
  const p = P[i], s = shown[i], d = [];
  if (p.fatal) { if (s.ok || !s.msgs.some(m => m.includes('Error'))) d.push('PHP stopped with an error but the page did not show one'); }
  else {
    if (!!p.ok !== s.ok) d.push(`ok ${p.ok} vs ${s.ok}`);
    if (p.ok) {
      if (p.reaction !== s.reaction) d.push('reaction');
      if (p.mw + ' (Molecular weights in g/mol)' !== s.mw) d.push('mw');
      if (p.rows.length !== s.rows.length) d.push('row count');
      else p.rows.forEach((r, k) => { if (norm(r[0]) !== norm(s.rows[k][0]) || r[2] !== s.rows[k][1]) d.push(`row ${k}: ${r[0]} ${r[2]} vs ${s.rows[k].join(' ')}`); });
    }
    const want = [...p.warnings.map(w => '<b>Warning:</b> ' + w), ...p.errors.map(e => '<b>Error:</b> ' + e)].map(norm);
    if (JSON.stringify(want) !== JSON.stringify(s.msgs.map(norm))) d.push(`messages: ${JSON.stringify(want)} vs ${JSON.stringify(s.msgs)}`);
  }
  if (d.length) fails.push([c.id ?? i, c.target, c.source, d]); else pass++;
});
console.log(`${pass}/${cases.length - skipped} cases: page display matches the original PHP`);
fails.slice(0, 15).forEach(f => console.log(JSON.stringify(f)));
process.exit(fails.length ? 1 : 0);
