// Checks the formula rewriting in chemsolve.js that the PHP does not have: nested groups,
// brackets and dot hydrates must give exactly the same result as the same formula written
// flat by hand, run through the page's input path (normalize, then the input filter).
// Usage: node nested.mjs
import { createRequire } from 'module';
const CS = createRequire(import.meta.url)('../../assets/js/chemsolve.js');
const clean = s => CS.normalize(s).replace(/[^a-zA-Z0-9.,()_]/g, '');
const AIR = 'CO3=O,NO3=O,NH4=,H2O,C,H,O';
// [typed target, typed sources, same target written flat, same sources written flat, list]
const T = [
  ['Ba3(Co(CN)6)2', 'Ba,Co,C,N', 'Ba3Co2C12N12', 'Ba,Co,C,N', ''],
  ['K3[Fe(CN)6]', 'K,Fe,C,N', 'K3FeC6N6', 'K,Fe,C,N', ''],
  ['((La0.5Sr0.5)2CuO4)', 'La2O3,SrCO3,CuO', 'LaSrCuO4', 'La2O3,SrCO3,CuO', AIR],
  ['LaNiO3', 'La2O3,Ni(NO3)2·6H2O', 'LaNiO3', 'La2O3,Ni(NO3)2(H2O)6', AIR],
  ['LaNiO3', 'La2O3, Ni(NO3)2 * 6H2O', 'LaNiO3', 'La2O3,Ni(NO3)2(H2O)6', AIR],
  ['BaTiO3', 'Ba(OH)2·8H2O,TiO2', 'BaTiO3', 'Ba(OH)2(H2O)8,TiO2', AIR],
  ['CuO', 'CuSO4·5H2O', 'CuO', 'CuSO4(H2O)5', 'SO4=O,H2O,O'],
  ['LiFeO2', 'LiOH·H2O,FeO(OH)', 'LiFeO2', 'LiOH(H2O),FeO(OH)', AIR],
  ['Fe2O3', 'K3[Fe(CN)6]', 'Fe2O3', 'K3FeC6N6', 'K,C,N,O'],
  ['CoO', '[Co(NH3)6]Cl3', 'CoO', 'CoN6H18Cl3', 'N,H,Cl,O'],
];
let pass = 0;
for (const [t, s, tf, sf, l] of T) {
  const a = CS.solve(clean(t), clean(s), l, '300', '1'), b = CS.solve(tf, sf, l, '300', '1');
  const same = a.ok && b.ok && a.rows.length === b.rows.length && a.rows.every((r, i) => r[1] === b.rows[i][1]);
  console.log(same ? 'ok  ' : 'FAIL', t, '<-', s, '|', a.ok ? a.rows.map(r => r[2]).join(' / ') : a.errors[0], same ? '' : '| flat: ' + (b.ok ? b.rows.map(r => r[2]).join(' / ') : b.errors[0]));
  if (same) pass++;
}
console.log(`${pass}/${T.length} rewritten formulas match the flat form exactly`);
process.exit(pass === T.length ? 0 : 1);
