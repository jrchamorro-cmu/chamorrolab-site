/*
 * JavaScript port of ChemSolve by the McQueen Lab, Johns Hopkins University,
 * https://github.com/tmcqueen-materials/chemsolve. GPL-2.0.
 *
 * This file is a line-by-line port of solve_amounts.phpi and the files it
 * includes (elements, parse_compound, remove_dummy, apply_remap, make_flat,
 * num_common, computeMW, implode_elem, solve_equations), plus the
 * form-handling logic of chemsolve.php (empty-input checks, explode on
 * commas, product-mass rescaling for quantType 2, sprintf("%.1f") display).
 * It is licensed under the GNU General Public License, version 2.
 *
 * Modified by the Chamorro Research Group, Carnegie Mellon University, 2026-09-25: units removed
 * with UNIT= are dropped from the balance (make_flat), and formulas are rewritten before parsing
 * (expandNested for nested groups; normalize for brackets and dot hydrates). Each change is
 * marked "Chamorro Lab" in the code.
 *
 * It reproduces PHP 8 semantics: int vs float (ints are held as BigInt),
 * numeric strings, loose comparisons, float-to-string at precision 14, and
 * sprintf %f rounding (exact decimal value, ties to even). Where PHP 8 would
 * stop with an uncaught TypeError or DivisionByZeroError, solve() returns
 * ok:false with the PHP error text in `fatal`.
 *
 * No dependencies. No network access. Plain ES2017 plus BigInt.
 *
 * API: ChemSolve.solve(target, source, dummy, amount, quantType)
 *   returns {rows: [[nameHtml, mg, mgString]], warnings, errors, ok,
 *            reaction, mw, fatal}
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------
  // PHP value model: string = JS string, int = BigInt, float = number,
  // null = null, array = JS array.
  // ------------------------------------------------------------------
  var I64_MIN = -(BigInt(1) << BigInt(63));
  var I64_MAX = (BigInt(1) << BigInt(63)) - BigInt(1);
  var ZERO = BigInt(0), ONE = BigInt(1);

  function PhpFatal(cls, msg) {
    this.phpClass = cls;
    this.message = msg;
  }

  function isArr(v) { return Array.isArray(v); }
  function idx(a, k) {
    if (!isArr(a)) return null;
    var v = a[k];
    return v === undefined ? null : v;
  }
  function typeName(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'bigint') return 'int';
    if (typeof v === 'number') return 'float';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'boolean') return 'bool';
    return 'array';
  }

  var WS = ' \t\n\r\u000b\f';
  var NUM_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;
  // PHP 8 numeric-string analysis. Returns null if non-numeric,
  // else {val, full} where full=false means leading-numeric.
  function numInfo(s) {
    var i = 0;
    while (i < s.length && WS.indexOf(s[i]) >= 0) i++;
    var m = NUM_RE.exec(s.slice(i));
    if (!m) return null;
    var rest = s.slice(i + m[0].length);
    var j = 0;
    while (j < rest.length && WS.indexOf(rest[j]) >= 0) j++;
    var full = (j === rest.length);
    var val, ovf = false;
    if (m[2] === undefined && m[3] === undefined && m[1][0] !== '.') {
      var b = BigInt(m[0]);
      if (b >= I64_MIN && b <= I64_MAX) val = b;
      else { val = Number(m[0]); ovf = true; }
    } else {
      val = Number(m[0]);
    }
    return { val: val, full: full, ovf: ovf };
  }

  // Convert operand for arithmetic.
  function toNum(v, op, a, b) {
    if (typeof v === 'bigint' || typeof v === 'number') return v;
    if (v === null || v === undefined) return ZERO;
    if (v === true) return ONE;
    if (v === false) return ZERO;
    if (typeof v === 'string') {
      var ni = numInfo(v);
      if (ni === null) {
        throw new PhpFatal('TypeError', 'Unsupported operand types: ' +
          typeName(a) + ' ' + op + ' ' + typeName(b));
      }
      return ni.val; // leading-numeric: PHP warns and continues
    }
    throw new PhpFatal('TypeError', 'Unsupported operand types: ' +
      typeName(a) + ' ' + op + ' ' + typeName(b));
  }

  function arith(op, a, b) {
    var x = toNum(a, op, a, b), y = toNum(b, op, a, b);
    if (typeof x === 'bigint' && typeof y === 'bigint') {
      var r;
      if (op === '/') {
        if (y === ZERO) throw new PhpFatal('DivisionByZeroError', 'Division by zero');
        if (y === -ONE && x === I64_MIN) return Number(x) / -1;
        if (x % y === ZERO) return x / y;
        return Number(x) / Number(y);
      }
      if (op === '+') r = x + y;
      else if (op === '-') r = x - y;
      else r = x * y;
      if (r < I64_MIN || r > I64_MAX) {
        if (op === '+') return Number(x) + Number(y);
        if (op === '-') return Number(x) - Number(y);
        return Number(x) * Number(y);
      }
      return r;
    }
    var fx = Number(x), fy = Number(y);
    if (op === '+') return fx + fy;
    if (op === '-') return fx - fy;
    if (op === '*') return fx * fy;
    if (fy === 0) throw new PhpFatal('DivisionByZeroError', 'Division by zero');
    return fx / fy;
  }
  function add(a, b) { return arith('+', a, b); }
  function sub(a, b) { return arith('-', a, b); }
  function mul(a, b) { return arith('*', a, b); }
  function div(a, b) { return arith('/', a, b); }
  function phpAbs(x) {
    if (typeof x === 'bigint') {
      if (x === I64_MIN) return -Number(x);
      return x < ZERO ? -x : x;
    }
    return Math.abs(Number(toNum(x, 'abs', x, x)));
  }

  function strcmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function lowerAscii(s) {
    return s.replace(/[A-Z]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 32); });
  }
  function numCmp(x, y) {
    if (typeof x === 'bigint' && typeof y === 'bigint') return x < y ? -1 : (x > y ? 1 : 0);
    var fx = Number(x), fy = Number(y);
    return fx < fy ? -1 : (fx > fy ? 1 : 0);
  }
  function truthy(v) {
    if (typeof v === 'bigint') return v !== ZERO;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v !== '' && v !== '0';
    if (isArr(v)) return v.length > 0;
    return !!v;
  }

  // PHP 8 loose comparison (<=>). Covers the type pairs this code produces.
  function cmp(a, b) {
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    var an = (typeof a === 'bigint' || typeof a === 'number');
    var bn = (typeof b === 'bigint' || typeof b === 'number');
    if (an && bn) return numCmp(a, b);
    if (typeof a === 'string' && typeof b === 'string') {
      var ia = numInfo(a), ib = numInfo(b);
      if (ia && ib && ia.full && ib.full) {
        if (ia.ovf && ib.ovf && Number(ia.val) === Number(ib.val)) return strcmp(a, b);
        return numCmp(ia.val, ib.val);
      }
      return strcmp(a, b);
    }
    if (an && typeof b === 'string') {
      var i2 = numInfo(b);
      if (i2 && i2.full) return numCmp(a, i2.val);
      return strcmp(phpStr(a), b);
    }
    if (typeof a === 'string' && bn) {
      var i1 = numInfo(a);
      if (i1 && i1.full) return numCmp(i1.val, b);
      return strcmp(a, phpStr(b));
    }
    if (a === null && b === null) return 0;
    if (a === null && typeof b === 'string') return b.length === 0 ? 0 : -1;
    if (typeof a === 'string' && b === null) return a.length === 0 ? 0 : 1;
    if (a === null || a === false) return truthy(b) ? -1 : 0;
    if (b === null || b === false) return truthy(a) ? 1 : 0;
    if (isArr(a) && !isArr(b)) return 1;
    if (!isArr(a) && isArr(b)) return -1;
    return 0;
  }
  function looseEq(a, b) { return cmp(a, b) === 0; }

  // ------------------------------------------------------------------
  // Exact decimal expansion of a double, and PHP number formatting.
  // ------------------------------------------------------------------
  function exactDigits(x) { // x finite, > 0
    var dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, x);
    var hi = dv.getUint32(0), lo = dv.getUint32(4);
    var exp = (hi >>> 20) & 0x7ff;
    var mant = (BigInt(hi & 0xfffff) << BigInt(32)) | BigInt(lo);
    if (exp === 0) exp = 1; else mant = mant | (ONE << BigInt(52));
    var e2 = exp - 1075;
    var N, f;
    if (e2 >= 0) { N = mant << BigInt(e2); f = 0; }
    else { N = mant * (BigInt(5) ** BigInt(-e2)); f = -e2; }
    var s = N.toString();
    return { digits: s.replace(/0+$/, ''), decpt: s.length - f };
  }
  // Round digit string to keep `n` leading digits, ties to even.
  function roundDigits(digits, n) {
    if (n < 0) return { digits: '', carry: false };
    if (digits.length <= n) return { digits: digits, carry: false };
    var keep = digits.slice(0, n), rest = digits.slice(n);
    var up;
    if (rest[0] > '5') up = true;
    else if (rest[0] < '5') up = false;
    else if (/[1-9]/.test(rest.slice(1))) up = true;
    else {
      var last = keep.length ? keep.charCodeAt(keep.length - 1) - 48 : 0;
      up = (last % 2) === 1;
    }
    if (!up) return { digits: keep, carry: false };
    var K = (BigInt(keep || '0') + ONE).toString();
    if (K.length > keep.length) return { digits: K, carry: true };
    return { digits: K, carry: false };
  }

  // (string)$float with precision=14 (php_gcvt, mode 2)
  function floatStr(x) {
    if (x !== x) return 'NAN';
    if (x === Infinity) return 'INF';
    if (x === -Infinity) return '-INF';
    var neg = (x < 0) || (x === 0 && 1 / x < 0);
    if (x === 0) return neg ? '-0' : '0';
    var ed = exactDigits(Math.abs(x));
    var rd = roundDigits(ed.digits, 14);
    var digits = rd.digits, decpt = ed.decpt;
    if (rd.carry) { decpt += 1; digits = digits.slice(0, 14); }
    digits = digits.replace(/0+$/, '');
    var out = neg ? '-' : '';
    var precision = 14;
    if (decpt < 0 ? decpt < -3 : decpt > precision) {
      var e = decpt - 1, esign = '+';
      if (e < 0) { esign = '-'; e = -e; }
      out += digits[0] + '.' + (digits.length > 1 ? digits.slice(1) : '0') + 'E' + esign + String(e);
    } else if (decpt < 0) {
      out += '0.' + '0'.repeat(-decpt) + digits;
    } else {
      var i;
      for (i = 0; i < decpt; i++) out += (i < digits.length ? digits[i] : '0');
      if (digits.length > decpt) {
        if (decpt === 0) out += '0';
        out += '.' + digits.slice(decpt);
      }
    }
    return out;
  }

  function phpStr(v) {
    if (v === null || v === undefined || v === false) return '';
    if (v === true) return '1';
    if (typeof v === 'string') return v;
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number') return floatStr(v);
    return 'Array';
  }
  function toFloat(v) { return Number(toNum(v, '', v, v)); }

  // sprintf("%<width>.<prec>f", v)
  function sprintfF(v, prec, width) {
    var x = toFloat(v);
    var s;
    // PHP 8.3 prints NaN as "NaN" and both infinities as "INF", unpadded
    if (x !== x) return 'NaN';
    if (x === Infinity || x === -Infinity) return 'INF';
    {
      var neg = x < 0;
      var ax = Math.abs(x);
      var intPart, frac;
      if (ax === 0) { intPart = '0'; frac = '0'.repeat(prec); }
      else {
        var ed = exactDigits(ax);
        var digits = ed.digits, decpt = ed.decpt;
        var keepCount = decpt + prec;
        if (keepCount < 0) { digits = '0'.repeat(-keepCount) + digits; keepCount = 0; }
        var K;
        if (keepCount >= digits.length) K = digits + '0'.repeat(keepCount - digits.length);
        else K = roundDigits(digits, keepCount).digits;
        if (K === '') K = '0';
        K = K.padStart(prec + 1, '0');
        intPart = K.slice(0, K.length - prec).replace(/^0+(?=\d)/, '');
        frac = K.slice(K.length - prec);
      }
      s = (neg ? '-' : '') + intPart + (prec > 0 ? '.' + frac : '');
    }
    while (s.length < (width || 0)) s = ' ' + s;
    return s;
  }

  // implode($sep, $arr) / implode($arr)
  function implode(sep, arr) {
    if (arr === undefined) { arr = sep; sep = ''; }
    var parts = [];
    for (var i = 0; i < arr.length; i++) parts.push(phpStr(arr[i]));
    return parts.join(sep);
  }
  function substr(s, start, len) {
    if (start > s.length) return '';
    if (len === undefined) return s.slice(start);
    return s.substr(start, len);
  }
  function strstr(h, n) {
    var p = h.indexOf(n);
    return p < 0 ? false : h.slice(p);
  }

  // ------------------------------------------------------------------
  // elements.phpi
  // ------------------------------------------------------------------
  var I = function (n) { return BigInt(n); };
  var ELEMS = [["H", 1.00794], ["He", 4.002602], ["Li", 6.941],
    ["Be", 9.012182], ["B", 10.811], ["C", 12.0107],
    ["N", 14.0067], ["O", 15.9994], ["F", 18.9984032],
    ["Ne", 20.1797], ["Na", 22.98977], ["Mg", 24.3050],
    ["Al", 26.981538], ["Si", 28.0855], ["P", 30.973761],
    ["S", 32.065], ["Cl", 35.453], ["Ar", 39.948],
    ["K", 39.0983], ["Ca", 40.078], ["Sc", 44.955910],
    ["Ti", 47.867], ["V", 50.9415], ["Cr", 51.9961],
    ["Mn", 54.938049], ["Fe", 55.845], ["Co", 58.933200],
    ["Ni", 58.6934], ["Cu", 63.546], ["Zn", 65.39],
    ["Ga", 69.723], ["Ge", 72.61], ["As", 74.92160],
    ["Se", 78.96], ["Br", 79.904], ["Kr", 83.80],
    ["Rb", 85.4678], ["Sr", 87.62], ["Y", 88.90585],
    ["Zr", 91.224], ["Nb", 92.90638], ["Mo", 95.94],
    ["Tc", I(98)], ["Ru", 101.07], ["Rh", 102.90550],
    ["Pd", 106.42], ["Ag", 107.8682], ["Cd", 112.411],
    ["In", 114.818], ["Sn", 118.710], ["Sb", 121.760],
    ["Te", 127.60], ["I", 126.90447], ["Xe", 131.29],
    ["Cs", 132.90545], ["Ba", 137.327], ["La", 138.9055],
    ["Ce", 140.116], ["Pr", 140.90765], ["Nd", 144.24],
    ["Pm", I(145)], ["Sm", 150.36], ["Eu", 151.964],
    ["Gd", 157.25], ["Tb", 158.92534], ["Dy", 162.50],
    ["Ho", 164.93032], ["Er", 167.26], ["Tm", 168.93421],
    ["Yb", 173.04], ["Lu", 174.967], ["Hf", 178.49],
    ["Ta", 180.9479], ["W", 183.84], ["Re", 186.207],
    ["Os", 190.23], ["Ir", 192.217], ["Pt", 195.078],
    ["Au", 196.96655], ["Hg", 200.59], ["Tl", 204.3833],
    ["Pb", 207.2], ["Bi", 208.98038], ["Po", I(209)],
    ["At", I(210)], ["Rn", I(222)], ["Fr", I(223)], ["Ra", I(226)],
    ["Ac", I(227)], ["Th", 232.0381], ["Pa", 231.03588],
    ["U", 238.0289], ["Np", I(237)], ["Pu", I(244)],
    ["Am", I(243)], ["Cm", I(247)], ["Bk", I(247)], ["Cf", I(251)],
    ["Es", I(252)], ["Fm", I(257)], ["Md", I(258)], ["No", I(259)],
    ["Lr", I(262)], ["Rf", I(261)], ["Db", I(262)], ["Sg", I(266)],
    ["Bh", I(264)], ["Hs", I(269)], ["Mt", I(268)]];

  function getElement(symbol) {
    var s = lowerAscii(phpStr(symbol));
    for (var i = 0; i < ELEMS.length; i++) {
      if (s === lowerAscii(ELEMS[i][0])) return ELEMS[i].slice();
    }
    return [];
  }

  // ------------------------------------------------------------------
  // parse_compound.phpi (parse_compound2.phpi is not included anywhere)
  // ------------------------------------------------------------------
  function parse_compound(compoundStr) {
    var stage = 0;
    var curElem = [], curNum = [], curIso = [];
    var warnings = [], ret = [];
    var store = false;
    for (var i = 0; i < compoundStr.length; i++) {
      var ch = compoundStr[i];
      var ascii = compoundStr.charCodeAt(i);
      var ucl = (ascii >= 65 && ascii <= 90);
      var lcl = (ascii >= 97 && ascii <= 122);
      var num = ((ascii >= 48 && ascii <= 57) || ascii === 46);
      var open = (ascii === 40);
      var iso = (ascii === 95);
      var gev;

      if (stage === 0) {
        if (open === true) {
          var restOfStr = strstr(substr(compoundStr, i + 1), ')');
          if (restOfStr === false) {
            warnings.push(implode(' ', ['No end parenthesis for open paren found at position', BigInt(i + 1), '. Ignoring the open parenthesis.']));
          } else {
            var rparsed = parse_compound(substr(compoundStr, i + 1, compoundStr.length - restOfStr.length - i - 1));
            i = compoundStr.length - restOfStr.length;
            if (rparsed[0].length > 0) {
              curElem.push(rparsed[0]);
              for (var j = 0; j < rparsed[1].length; j++) warnings.push(rparsed[1][j]);
              if (restOfStr.length > 1) stage = 2;
            }
          }
        } else if (ucl === true) {
          curElem[0] = ch;
          stage = 1;
        } else if (lcl === true) {
          curElem[0] = ch;
          warnings.push(implode(' ', ['Lowercase character', ch, 'found at position', BigInt(i + 1), 'when expecting uppercase for new element; treating as uppercase.']));
          stage = 1;
        } else {
          warnings.push(implode(' ', ['Unknown character', ch, 'found at position', BigInt(i + 1), 'when expecting an uppercase letter for a new element. Ignoring it.']));
        }
      } else if (stage === 1) {
        if (lcl === true) {
          curElem[1] = ch;
          stage = 2;
        } else if (num === true) {
          curNum[0] = ch;
          stage = 2;
        } else if (ucl === true) {
          gev = getElement(implode('', [curElem[0], ch]));
          if (gev.length > 0 && cmp(gev[1], BigInt(227)) < 0 && strcmp(gev[0], 'Co') !== 0) {
            warnings.push(implode(' ', ['The character sequence', implode('', [curElem[0], ch]), 'found at position', BigInt(i + 1), 'is ambiguous. Could be', gev[0], 'but treating', ch, 'as first letter of next element.']));
          }
          store = true;
          i--;
          stage = 0;
        } else if (open === true) {
          store = true;
          i--;
          stage = 0;
        } else if (iso === true) {
          stage = 3;
        } else {
          warnings.push(implode(' ', ['Unknown character', ch, 'found at position', BigInt(i + 1), 'when expecting an lowercase letter or number. Ignoring It.']));
        }
      } else if (stage === 2) {
        if (num === true) {
          curNum.push(ch);
        } else if (ucl === true || lcl === true || open === true) {
          store = true;
          i--;
          stage = 0;
        } else if (iso === true) {
          stage = 3;
        } else {
          warnings.push(implode(' ', ['Unknown character', ch, 'found at position', BigInt(i + 1), 'when expecting a number. Ignoring It.']));
        }
      } else if (stage === 3) {
        if (num === true) {
          curIso.push(ch);
        } else if (ucl === true || lcl === true || open === true) {
          store = true;
          i--;
          stage = 0;
        } else {
          warnings.push(implode(' ', ['Unknown character', ch, 'found at position', BigInt(i + 1), 'when expecting a number. Ignoring It.']));
        }
      }

      if (store === true || i + 1 === compoundStr.length) {
        var okElem = false;
        if (curElem.length > 0 && isArr(curElem[0])) {
          okElem = true;
        } else {
          gev = getElement(implode('', curElem));
          if (gev.length > 0) {
            okElem = true;
            if (curIso.length < 1) curIso.push(gev[1]);
          }
        }
        if (curElem.length > 0 && okElem === true) {
          if (curNum.length < 1) curNum.push('1');
          if (isArr(curElem[0])) {
            ret.push([curElem[0], implode('', curNum)]);
          } else {
            ret.push([[implode('', curElem), implode('', curIso)], implode('', curNum)]);
          }
        } else {
          warnings.push(implode(' ', ['Attempted to parse an unkown element:', implode('', curElem), '. Ignoring it.']));
        }
        store = false;
        curNum = [];
        curIso = [];
        curElem = [];
      }
    }
    return [ret, warnings];
  }

  // ------------------------------------------------------------------
  // remove_dummy.phpi
  // ------------------------------------------------------------------
  function remove_dummy(tgtArr, dummyArr) {
    var rf = -ONE;
    var warnings = [];
    var i, j;
    for (i = 0; i < dummyArr.length; i++) {
      var ef = 0;
      for (j = 0; j < tgtArr.length; j++) {
        if (lowerAscii(implode(dummyArr[i][0])) === lowerAscii(implode(tgtArr[j][0]))) {
          var nf = div(tgtArr[j][1], dummyArr[i][1]);
          if (cmp(nf, rf) < 0 || looseEq(rf, -ONE)) rf = nf;
          ef = 1;
          j = tgtArr.length;
        }
      }
      if (ef === 0) rf = ZERO;
    }
    var newtgt = [];
    if (cmp(rf, ZERO) <= 0) rf = ZERO;
    for (j = 0; j < tgtArr.length; j++) {
      var nt = tgtArr[j][1];
      for (i = 0; i < dummyArr.length; i++) {
        if (lowerAscii(implode(dummyArr[i][0])) === lowerAscii(implode(tgtArr[j][0])))
          nt = sub(nt, mul(rf, dummyArr[i][1]));
      }
      if (cmp(nt, ZERO) > 0) newtgt.push([tgtArr[j][0], nt]);
      else if (cmp(nt, ZERO) < 0) warnings.push(implode(' ', ['Negative value for', tgtArr[j][0], 'of', nt]));
    }
    return [newtgt, warnings];
  }

  // ------------------------------------------------------------------
  // apply_remap.phpi
  // ------------------------------------------------------------------
  function apply_remap(tgt, map) {
    var tgtArr = tgt.map(function (e) { return e.slice(); }); // array_merge copy
    var warnings = [];
    var i, j, k;
    for (i = 0; i < tgtArr.length; i++) {
      if (isArr(idx(idx(tgtArr[i], 0), 0))) {
        var rv = apply_remap(tgtArr[i][0], map);
        tgtArr[i][0] = rv[0];
        for (j = 0; j < rv[1].length; j++) warnings.push(rv[1][j]);
      }
    }
    var cm = map[0];
    var good = true;
    var oldk = 0;
    for (j = 0; j < cm.length && good; j++) {
      k = oldk;
      while (k < tgtArr.length) {
        if (!isArr(idx(idx(tgtArr[k], 0), 0))) {
          if (strcmp(implode(tgtArr[k][0]), implode(cm[j][0])) === 0) {
            if (!looseEq(tgtArr[k][1], cm[j][1])) good = false;
            oldk = k;
            k = tgtArr.length + 2;
          }
        }
        k++;
      }
      if (k !== tgtArr.length + 3) good = false;
    }
    if (good === true) {
      oldk = 0;
      for (j = 0; j < cm.length; j++) {
        k = oldk;
        while (k < tgtArr.length) {
          if (!isArr(idx(idx(tgtArr[k], 0), 0))) {
            if (strcmp(implode(tgtArr[k][0]), implode(cm[j][0])) === 0) {
              if (j === 0) {
                tgtArr[k][0] = map[1];
                tgtArr[k][1] = '1';
              } else tgtArr[k][1] = '0';
              oldk = k;
              k = tgtArr.length + 2;
            }
          }
          k++;
        }
      }
    }
    return [tgtArr, warnings];
  }

  // ------------------------------------------------------------------
  // make_flat.phpi
  // ------------------------------------------------------------------
  function make_flat(tgt, newtgt, factor) {
    if (newtgt === undefined) newtgt = [];
    if (factor === undefined) factor = ONE;
    var warnings = [];
    for (var i = 0; i < tgt.length; i++) {
      // Chamorro Lab change (2026-09-25), not in the PHP: a unit remapped to nothing
      // ("H2O=") leaves an entry with an empty name here. The PHP counts it as an element
      // with no name, so every hydrate came out "Not Used". Skip it, so the unit is removed.
      if (isArr(tgt[i][0]) && tgt[i][0].length === 0) continue;
      if (isArr(idx(idx(tgt[i], 0), 0))) {
        if (cmp(tgt[i][1], ZERO) > 0) {
          var rv = make_flat(tgt[i][0], newtgt, mul(tgt[i][1], factor));
          newtgt = rv[0];
          for (var j = 0; j < rv[1].length; j++) warnings.push(rv[1][j]);
        }
      } else {
        if (cmp(tgt[i][1], ZERO) > 0) {
          var added = false;
          for (var jj = 0; jj < newtgt.length && !added; jj++) {
            if (strcmp(implode(tgt[i][0]), implode(newtgt[jj][0])) === 0) {
              newtgt[jj][1] = add(newtgt[jj][1], mul(tgt[i][1], factor));
              added = true;
            }
          }
          if (!added) newtgt.push([tgt[i][0], mul(tgt[i][1], factor)]);
        }
      }
    }
    return [newtgt, warnings];
  }

  // ------------------------------------------------------------------
  // num_common.phpi
  // ------------------------------------------------------------------
  function num_common(arr1, arr2) {
    var nc = 0;
    for (var i = 0; i < arr1.length; i++) {
      for (var j = 0; j < arr2.length; j++) {
        if (lowerAscii(implode(arr1[i][0])) === lowerAscii(implode(arr2[j][0]))) {
          nc += 1;
          j = arr2.length;
        }
      }
    }
    return [nc, []];
  }

  // ------------------------------------------------------------------
  // computeMW.phpi
  // ------------------------------------------------------------------
  function computeMW(compoundArr) {
    var mw = ZERO;
    for (var i = 0; i < compoundArr.length; i++) {
      if (isArr(idx(idx(compoundArr[i], 0), 0))) {
        var rv = computeMW(compoundArr[i][0]);
        mw = add(mw, mul(rv[0], compoundArr[i][1]));
      } else {
        mw = add(mw, mul(compoundArr[i][0][1], compoundArr[i][1]));
      }
    }
    return [mw, []];
  }

  // ------------------------------------------------------------------
  // implode_elem.phpi
  // ------------------------------------------------------------------
  function implode_elem(sep, arr) {
    var rv = '';
    for (var i = 0; i < arr.length; i++) {
      var np = '';
      if (isArr(idx(idx(arr[i], 0), 0))) {
        np = '(' + sep + implode_elem(sep, arr[i][0]) + sep + ')';
        if (!looseEq(arr[i][1], ONE)) np = np + sep + phpStr(arr[i][1]);
      } else {
        np = '';
        if (!looseEq(idx(getElement(idx(arr[i][0], 0)), 1), idx(arr[i][0], 1)))
          np += '<sup>' + phpStr(idx(arr[i][0], 1)) + '</sup>';
        np += phpStr(idx(arr[i][0], 0));
        if (!looseEq(arr[i][1], ONE))
          np += sep + '<sub>' + phpStr(arr[i][1]) + '</sub>';
      }
      if (np.length > 0) {
        if (rv.length < 1) rv = np;
        else rv = rv + sep + np;
      }
    }
    return rv;
  }

  // ------------------------------------------------------------------
  // solve_equations.phpi
  // ------------------------------------------------------------------
  function rndZero(x) {
    if (cmp(phpAbs(x), 1e-13) < 0) return ZERO;
    return x;
  }

  function solve_equations(arrIn, resIn) {
    var arr = arrIn.map(function (r) { return r.slice(); });
    var res = resIn.slice();
    var ro = [];
    var i, c, r, k, tmp;
    for (i = 0; i < res.length; i++) ro[i] = i;

    for (c = 0; c < arr[0].length; c++) {
      r = c;
      while (r < arr.length && looseEq(arr[r][c], ZERO)) r++;
      if (r < arr.length && r > c) {
        tmp = arr[c]; arr[c] = arr[r]; arr[r] = tmp;
        tmp = res[c]; res[c] = res[r]; res[r] = tmp;
        tmp = ro[c]; ro[c] = ro[r]; ro[r] = tmp;
      } else if (r === c) {
        // pivot already in place
      } else {
        return [res, ['Underspecified System (' + c + '). You need fewer starting materials.']];
      }
      for (k = 0; k < arr[c].length; k++)
        if (k !== c) arr[c][k] = rndZero(div(arr[c][k], arr[c][c]));
      res[c] = rndZero(div(res[c], arr[c][c]));
      arr[c][c] = ONE;
      for (r = 0; r < arr.length; r++) {
        if (r !== c) {
          for (k = 0; k < arr[r].length; k++)
            if (k !== c) arr[r][k] = rndZero(sub(arr[r][k], mul(arr[c][k], arr[r][c])));
          res[r] = rndZero(sub(res[r], mul(res[c], arr[r][c])));
          arr[r][c] = ZERO;
        }
      }
    }
    var rv = res, na = arr;
    var zero = [];
    for (i = 0; i < na.length; i++) {
      var j = 0;
      while (j < na[0].length) { if (looseEq(na[i][j], ZERO)) { j++; } else { break; } }
      if (j >= na[0].length && looseEq(rv[i], ZERO)) zero.push(i);
    }
    if (zero.length + arr[0].length > arr.length)
      return [rv, ['Underspecified system (' + zero.length + ',' + arr[0].length + ',' + arr.length + '). Was one of the compounds below incorrectly parsed?', 'Also check to make sure atom balances are possible with the given starting materials. This error often occurs if there is more than one combination of starting materials that can produce the desired product, such as when starting with two materials that differ only in their oxygen content (e.g. Nb2O4 and Nb2O5) and oxygen <I>is</I> allowed to equilibrate with the atmosphere.']];
    else if (zero.length + arr[0].length < arr.length)
      return [rv, ['Overspecified system (' + zero.length + ',' + arr[0].length + ',' + arr.length + '). Was one of the compounds below incorrectly parsed?', 'Also check to make sure atom balances are possible with the given starting materials. This error often occurs if it is not possible to produce the desired product with the given starting materials because of a difference in, e.g., oxygen content when oxygen is not being allowed to equilibrate with the atmosphere.']];

    var rv2 = [];
    var jz = 0;
    for (i = 0; i < rv.length; i++) {
      if ((jz < zero.length && zero[jz] !== i) || jz >= zero.length) rv2.push(rv[i]);
      else jz++;
    }
    return [rv2, []];
  }

  // ------------------------------------------------------------------
  // solve_amounts.phpi
  // ------------------------------------------------------------------
  function solve_amounts(target, source, dummy, amount) {
    var warnings = [], errors = [];
    var dead = false;
    var i, j, k, s, s2;

    var rv = parse_compound(target);
    for (j = 0; j < rv[1].length; j++) warnings.push(implode(': ', [target, rv[1][j]]));
    rv = rv[0];
    var mw = computeMW(rv);
    for (j = 0; j < mw[1].length; j++) warnings.push(implode(': ', [target, mw[1][j]]));
    mw = mw[0];
    var tgt = [rv, mw];

    var srcs = source;
    var src = [];
    for (i = 0; i < srcs.length; i++) {
      s = parse_compound(srcs[i]);
      for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [srcs[i], s[1][j]]));
      s = s[0];
      var w = computeMW(s);
      for (j = 0; j < w[1].length; j++) warnings.push(implode(': ', [srcs[i], w[1][j]]));
      w = w[0];
      src[i] = [s, w];
    }

    var dbs = dummy;
    var db = [];
    var remap = [];
    for (i = 0; i < dbs.length; i++) {
      var equiv = strstr(dbs[i], '=');
      if (equiv === false) {
        s = parse_compound(dbs[i]);
        s2 = [[], []];
        db.push([s[0]]);
      } else {
        s = parse_compound(substr(dbs[i], 0, dbs[i].length - equiv.length));
        s2 = parse_compound(substr(dbs[i], dbs[i].length - equiv.length + 1));
        remap.push([s[0], s2[0]]);
      }
      for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [dbs[i], s[1][j]]));
      for (j = 0; j < s2[1].length; j++) warnings.push(implode(': ', [dbs[i], s2[1][j]]));
    }

    for (i = 0; i < src.length; i++) {
      for (k = 0; k < remap.length; k++) {
        s = apply_remap(src[i][0], remap[k]);
        for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [srcs[i], s[1][j]]));
        s = s[0];
        src[i][0] = s;
        if (i === 0) {
          s = apply_remap(tgt[0], remap[k]);
          for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [target, s[1][j]]));
          s = s[0];
          tgt[0] = s;
        }
      }
      s = make_flat(src[i][0]);
      for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [srcs[i], s[1][j]]));
      s = s[0];
      src[i][0] = s;
      if (i === 0) {
        s = make_flat(tgt[0]);
        for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [srcs[i], s[1][j]]));
        s = s[0];
        tgt[0] = s;
      }
      for (k = 0; k < db.length; k++) {
        s = remove_dummy(src[i][0], db[k][0]);
        for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [srcs[i], s[1][j]]));
        s = s[0];
        src[i][0] = s;
        if (i === 0) {
          s = remove_dummy(tgt[0], db[k][0]);
          for (j = 0; j < s[1].length; j++) warnings.push(implode(': ', [srcs[i], s[1][j]]));
          s = s[0];
          tgt[0] = s;
        }
      }
    }

    var srcInTgt = [], srcNoTgt = [];
    for (i = 0; i < src.length; i++) {
      var nc = num_common(tgt[0], src[i][0]);
      for (j = 0; j < nc[1].length; j++) warnings.push(implode(': ', [srcs[i], nc[1][j]]));
      s = src[i].slice();
      s[2] = srcs[i];
      if (nc[0] < src[i][0].length) srcNoTgt.push(s);
      else srcInTgt.push(s);
    }

    if (tgt[0].length < srcInTgt.length) {
      errors.push(implode('', ['The number of elements in reduced target (=', BigInt(tgt[0].length), ') is less than the number of source materials (=', BigInt(srcInTgt.length), ')!  Cannot solve for quantities. This error often occurs when two starting materials differ only in oxygen content (e.g. NbO2 and Nb2O5), and oxygen is allowed to equilibrate with the atmosphere.']));
      dead = true;
    }

    var sol;
    if (dead === false) {
      var solveArr = [], solveVec = [];
      for (i = 0; i < tgt[0].length; i++) {
        for (k = 0; k < srcInTgt.length; k++) {
          var l = 0;
          for (; l < srcInTgt[k][0].length; l++)
            if (lowerAscii(implode(srcInTgt[k][0][l][0])) === lowerAscii(implode(tgt[0][i][0]))) break;
          if (solveArr[i] === undefined) solveArr[i] = [];
          if (l < srcInTgt[k][0].length) solveArr[i][k] = srcInTgt[k][0][l][1];
          else solveArr[i][k] = ZERO;
        }
        solveVec[i] = tgt[0][i][1];
      }
      // PHP only creates $solveArr[$i] when the inner loop runs
      var solveArrCount = srcInTgt.length > 0 ? solveArr.length : 0;
      if (solveArrCount > 0) {
        sol = solve_equations(solveArr, solveVec);
        if (sol[1].length > 0) {
          for (j = 0; j < sol[1].length; j++) errors.push(implode(': ', ['Error During Solve', sol[1][j]]));
          dead = true;
        }
        sol = sol[0];
      } else {
        errors.push('Input array does not have at least one element: source and target specified correctly?');
        dead = true;
      }
    }

    if (dead === false) {
      for (i = 0; i < sol.length; i++) {
        if (cmp(sol[i], ZERO) < 0) {
          dead = true;
          errors.push(implode('', ['Negative value found during solve for source compound ', implode_elem('', srcInTgt[i][0]), ' = ', sol[i], '. This error often occurs when it is not possible to make the target formula with the starting materials provided, such as when oxygen is <I>not</I> allowed to equilibrate with the atmosphere and the starting materials are in the wrong oxidation states.']));
        }
      }
    }

    var grams = [], rxn = '', sub1 = '';
    if (dead === false) {
      var tmw = ZERO;
      for (i = 0; i < sol.length; i++) tmw = add(tmw, mul(sol[i], srcInTgt[i][1]));
      var moles = div(amount, tmw);
      for (i = 0; i < srcInTgt.length; i++)
        grams.push([implode(' as ', [srcInTgt[i][2], implode_elem('', srcInTgt[i][0])]), mul(mul(sol[i], moles), srcInTgt[i][1])]);
      grams.push([implode(' as ', [target, implode_elem('', tgt[0])]), mul(moles, tgt[1])]);

      for (i = 0; i < sol.length; i++) {
        if (i > 0) { rxn += ' + '; sub1 += '   '; }
        var atr = sprintfF(sol[i], 2, 0) + ' ' + phpStr(srcInTgt[i][2]);
        rxn += atr;
        sub1 += sprintfF(srcInTgt[i][1], 2, 7);
        for (j = 7; j < atr.length; j++) sub1 += ' ';
      }
      rxn += '  ->  ' + target;
      sub1 += '      ' + sprintfF(tgt[1], 2, 4);
    }

    if (dead === false) {
      return [grams, warnings, errors, true, rxn, sub1];
    } else {
      for (i = 0; i < srcInTgt.length; i++)
        errors.push(implode(' as ', [srcInTgt[i][2], implode_elem('', srcInTgt[i][0])]));
      for (i = 0; i < srcNoTgt.length; i++)
        errors.push(implode(' as ', [srcNoTgt[i][2], implode_elem('', srcNoTgt[i][0])]) + ' (Not Used)');
      errors.push(implode(' as ', [target, implode_elem('', tgt[0])]));
      if (sol === undefined) sol = '';
      return [sol, warnings, errors, false, '', '', ''];
    }
  }

  // ------------------------------------------------------------------
  // chemsolve.php form handling (web branch), minus HTML output.
  // Inputs are expected to be filtered already, as chemsolve.php's
  // sanitize_paranoid_string / sanitize_paranoid_tokens do.
  // dummy === null or undefined means "not set" (form not submitted).
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // Chamorro Lab additions (2026-09-25), not in the PHP
  // ------------------------------------------------------------------
  // The PHP parser reads one level of parentheses only: Ba3(Co(CN)6)2 comes out wrong. Before
  // parsing, expand every group that sits inside another group by multiplying out its counts:
  // Ba3(Co(CN)6)2 -> Ba3(CoC6N6)2, which the parser reads correctly. Groups at the first level,
  // such as (H2O)6 or (NO3)2, are left as they are so the do-not-balance list still sees them.
  // A group holding an isotope (B_11) or anything unexpected is left alone.
  function fmtCount(x) {
    var s = String(parseFloat(x.toPrecision(12)));
    return s === '1' ? '' : s;
  }
  function expandNested(f) {
    for (var guard = 0; guard < 50; guard++) {
      var re = /\(([^()]*)\)(\d*\.?\d*)/g, m, done = true;
      while ((m = re.exec(f)) !== null) {
        var before = f.slice(0, m.index);
        var depth = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
        if (depth < 1) continue;                        // first-level group: keep it
        var inner = m[1];
        if (!/^([A-Z][a-z]?\d*\.?\d*)+$/.test(inner)) continue;   // isotopes or odd input: leave
        var mult = m[2] === '' || m[2] === '.' ? 1 : parseFloat(m[2]);
        var flat = inner.replace(/([A-Z][a-z]?)(\d*\.?\d*)/g, function (_, el, n) {
          var c = n === '' || n === '.' ? 1 : parseFloat(n);
          return el + fmtCount(c * mult);
        });
        f = f.slice(0, m.index) + flat + f.slice(m.index + m[0].length);
        done = false;
        break;
      }
      if (done) break;
    }
    return f;
  }
  // Rewrite common ways of typing a formula into the syntax the parser reads, before the input
  // filter removes the characters: square and curly brackets become parentheses, and a hydrate
  // or adduct written with a dot (Ni(NO3)2·6H2O, CuSO4*5H2O) becomes a group, Ni(NO3)2(H2O)6.
  function normalize(s) {
    s = String(s === null || s === undefined ? '' : s);
    s = s.replace(/[\[{]/g, '(').replace(/[\]}]/g, ')');
    s = s.replace(/\s*[·•⋅∙*]\s*(\d*\.?\d*)\s*([A-Za-z0-9_()]+)/g, function (_, n, unit) {
      return '(' + unit + ')' + (n === '1' ? '' : n);
    });
    return s;
  }

  function solve(target, source, dummy, amount, quantType) {
    target = (target === null || target === undefined) ? '' : expandNested(String(target));
    source = (source === null || source === undefined) ? '' : String(source).split(',').map(expandNested).join(',');
    amount = (amount === null || amount === undefined) ? '' : String(amount);
    if (quantType === null || quantType === undefined) quantType = ONE;
    else if (typeof quantType === 'number') quantType = Number.isInteger(quantType) ? BigInt(quantType) : quantType;
    var dummySet = !(dummy === null || dummy === undefined);
    if (dummySet) dummy = String(dummy);

    var out = { rows: [], warnings: [], errors: [], ok: false, reaction: '', mw: '', fatal: null };
    var errors = [], warnings = [];
    var doSolve = true, solveOK = true, result = null;
    try {
      if (target.length < 1 || source.length < 1 || amount.length < 1 || !dummySet) {
        doSolve = false;
        solveOK = false;
        if (target.length < 1) errors.push('Target Not Specified!');
        if (source.length < 1) errors.push('Source Not Specified!');
        if (amount.length < 1) errors.push('Amount Not Specified!');
        if (target.length < 1 && source.length < 1 && amount.length < 1 && !dummySet) errors = [];
      }
      if (doSolve === true) {
        result = solve_amounts(target, source.split(','), dummy.split(','), amount);
        warnings = result[1];
        errors = result[2];
        solveOK = result[3];
      }
      if (solveOK === true) {
        var rows = result[0];
        if (looseEq(quantType, BigInt(2))) {
          var productMass = rows[rows.length - 1][1];
          var mf = div(amount, productMass);
          for (var i = 0; i < rows.length; i++) rows[i][1] = mul(rows[i][1], mf);
        }
        out.rows = rows.map(function (r) { return [r[0], Number(r[1]), sprintfF(r[1], 1, 0)]; });
        out.reaction = result[4];
        out.mw = result[5];
      }
    } catch (e) {
      if (e instanceof PhpFatal) {
        return { rows: [], warnings: [], errors: ['Calculation stopped: ' + e.phpClass + ': ' + e.message], ok: false, reaction: '', mw: '', fatal: e.phpClass + ': ' + e.message };
      }
      throw e;
    }
    out.ok = solveOK === true;
    out.warnings = warnings;
    out.errors = errors;
    return out;
  }

  var api = {
    solve: solve,
    normalize: normalize,
    // exposed for testing
    _internal: { expandNested: expandNested, sprintfF: sprintfF, phpStr: phpStr, solve_amounts: solve_amounts, parse_compound: parse_compound }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ChemSolve = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
