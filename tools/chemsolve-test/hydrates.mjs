// Checks chemsolve.js on hydrates and other unit removals ("H2O=", "NH4=") against masses
// calculated by hand from the molecular weights. These are the cases where chemsolve.js
// deliberately differs from the PHP, which reports the hydrate as "Not Used".
// Usage: node hydrates.mjs
import { createRequire } from 'module';
const CS = createRequire(import.meta.url)('../../assets/js/chemsolve.js');
const MW = { NiO: 74.69, NiNO3_6H2O: 290.79, La2O3: 325.81, LaNiO3: 245.60, CuSO4_5H2O: 249.69, CuO: 79.55,
  YNO3_6H2O: 383.01, CuNO3_3H2O: 241.60, Y2Cu2O5: 384.90, CaCO3: 100.09, NH42HPO4: 132.06, Ca3PO42: 310.18,
  YCl3_6H2O: 303.36, Y2O3: 225.81, CoC2O4_2H2O: 182.98, CoO: 74.93, Cs2CO3: 325.82, NH4Cl: 53.49, CsCl: 168.36 };
// [target, sources, dummy, mg, quantType, [[coefficient, MW] for each source in order], product MW]
const T = [
  ['NiO', 'Ni(NO3)2(H2O)6', 'CO3=O,NO3=O,O,H2O=', 300, 1, [[1, MW.NiNO3_6H2O]], MW.NiO],
  ['LaNiO3', 'La2O3,Ni(NO3)2(H2O)6', 'CO3=O,NO3=O,O,H2O=', 300, 1, [[0.5, MW.La2O3], [1, MW.NiNO3_6H2O]], MW.LaNiO3],
  ['LaNiO3', 'La2O3,Ni(NO3)2(H2O)6', 'H2O=,CO3=O,NO3=O,O', 300, 1, [[0.5, MW.La2O3], [1, MW.NiNO3_6H2O]], MW.LaNiO3],
  ['LaNiO3', 'La2O3,Ni(NO3)2(H2O)6', 'CO3=O,NO3=O,O,H2O=', 1000, 2, [[0.5, MW.La2O3], [1, MW.NiNO3_6H2O]], MW.LaNiO3],
  ['CuO', 'CuSO4(H2O)5', 'SO4=O,O,H2O=', 300, 1, [[1, MW.CuSO4_5H2O]], MW.CuO],
  ['CuO', 'CuSO4H2O5', 'SO4=O,O,H2O=', 300, 1, null, null],  // unit must be written (H2O)5: expect no answer
  ['Y2Cu2O5', 'Y(NO3)3(H2O)6,Cu(NO3)2(H2O)3', 'CO3=O,NO3=O,O,H2O=', 500, 2, [[2, MW.YNO3_6H2O], [2, MW.CuNO3_3H2O]], MW.Y2Cu2O5],
  ['Y2O3', 'YCl3(H2O)6', 'O,H2O=,Cl', 300, 1, [[2, MW.YCl3_6H2O]], MW.Y2O3],
  ['CoO', 'CoC2O4(H2O)2', 'C2O4=O,H2O=,O', 300, 1, [[1, MW.CoC2O4_2H2O]], MW.CoO],
  ['Ca3(PO4)2', 'CaCO3,(NH4)2HPO4', 'CO3=O,NO3=O,O,NH4=,H', 300, 1, [[3, MW.CaCO3], [2, MW.NH42HPO4]], MW.Ca3PO42],
  ['CsCl', 'Cs2CO3,NH4Cl', 'CO3=O,NO3=O,O,NH4=,H', 300, 1, [[0.5, MW.Cs2CO3], [1, MW.NH4Cl]], MW.CsCl],
];
let pass = 0;
for (const [tg, src, dm, mg, q, coef, pmw] of T) {
  const r = CS.solve(tg, src, dm, String(mg), String(q));
  let ok;
  if (!coef) ok = !r.ok;
  else {
    const masses = coef.map(([n, w]) => n * w), total = masses.reduce((a, b) => a + b);
    const moles = q === 1 ? mg / total : mg / pmw;           // formula units of product, in mmol
    const want = [...masses.map(m => m * moles), pmw * moles];
    ok = r.ok && r.rows.length === want.length && r.rows.every((row, i) => Math.abs(row[1] - want[i]) < 0.15);
    if (!ok) console.log('expected', want.map(x => x.toFixed(1)).join(' / '));
  }
  console.log(ok ? 'ok  ' : 'FAIL', tg, '<-', src, '|', dm, '|', r.ok ? r.rows.map(x => x[2]).join(' / ') : r.errors[0]);
  if (ok) pass++;
}
console.log(`${pass}/${T.length} unit-removal cases match hand-calculated masses`);
process.exit(pass === T.length ? 0 : 1);
