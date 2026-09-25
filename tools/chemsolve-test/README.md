# ChemSolve port: equivalence test

`assets/js/chemsolve.js` is a JavaScript port of McQueen's ChemSolve
(https://github.com/tmcqueen-materials/chemsolve, GPL-2.0). This folder checks it against the
original PHP, run locally through WebAssembly PHP. It never contacts any ChemSolve server.

    git clone https://github.com/tmcqueen-materials/chemsolve upstream
    npm install @php-wasm/node
    node compare.mjs cases.json tricky.json                          # chemsolve.js vs PHP
    node --experimental-websocket e2e.mjs cases.json tricky.json     # the built page vs PHP

    node hydrates.mjs                                                # unit removal vs hand-calculated masses

One deliberate change from the PHP (2026-09-25, `make_flat` in chemsolve.js): a unit removed with
`UNIT=` (hydrate water `H2O=`, ammonium `NH4=`) is dropped from the balance. The PHP leaves an
element with no name in its place and reports the starting material "Not Used". compare.mjs and
e2e.mjs skip only the cases that use `UNIT=` and where the PHP finds no answer; every case where the
PHP gives an answer must still match it exactly. hydrates.mjs checks the changed behaviour against
masses calculated by hand.

`e2e.mjs` needs `python3 serve.py 8000` running in the repo. It types each case into the built
page in headless Chrome, raw input included, and compares what the page shows (reaction, weights,
every row, every warning and error) with the PHP run on the same input after chemsolve.php's own
input filters.

`upstream/` and `node_modules/` are not committed. Last run 2026-09-25, PHP 8.3, after the unit-removal change: compare.mjs and e2e.mjs 2,578 of
2,578 matching (181 hand-written plus 2,800 generated cases, 403 unit-removal cases with no PHP
answer skipped), masses bit-identical; hydrates.mjs 11 of 11.
