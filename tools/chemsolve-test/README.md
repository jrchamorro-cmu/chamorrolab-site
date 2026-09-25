# ChemSolve port: equivalence test

`assets/js/chemsolve.js` is a JavaScript port of McQueen's ChemSolve
(https://github.com/tmcqueen-materials/chemsolve, GPL-2.0). This folder checks it against the
original PHP, run locally through WebAssembly PHP. It never contacts any ChemSolve server.

    git clone https://github.com/tmcqueen-materials/chemsolve upstream
    npm install @php-wasm/node
    node compare.mjs cases.json tricky.json

`upstream/` and `node_modules/` are not committed. Last run 2026-09-25: 181 of 181 cases
match (plus 2,800 generated cases during the port), masses bit-identical, PHP 8.3.
