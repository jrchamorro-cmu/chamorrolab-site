# ChemSolve port: equivalence test

`assets/js/chemsolve.js` is a JavaScript port of McQueen's ChemSolve
(https://github.com/tmcqueen-materials/chemsolve, GPL-2.0). This folder checks it against the
original PHP, run locally through WebAssembly PHP. It never contacts any ChemSolve server.

    git clone https://github.com/tmcqueen-materials/chemsolve upstream
    npm install @php-wasm/node
    node compare.mjs cases.json tricky.json                          # chemsolve.js vs PHP
    node --experimental-websocket e2e.mjs cases.json tricky.json     # the built page vs PHP

`e2e.mjs` needs `python3 serve.py 8000` running in the repo. It types each case into the built
page in headless Chrome, raw input included, and compares what the page shows (reaction, weights,
every row, every warning and error) with the PHP run on the same input after chemsolve.php's own
input filters.

`upstream/` and `node_modules/` are not committed. Last run 2026-09-25, PHP 8.3: compare.mjs 181 of 181 plus 2,800 generated cases, masses
bit-identical; e2e.mjs 181 of 181 plus the same 2,800 generated cases.
