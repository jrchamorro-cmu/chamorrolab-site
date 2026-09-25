<?php
// Reference driver: runs the ORIGINAL, unmodified ChemSolve PHP (solve_amounts.phpi and its
// includes) on each case in /tmp/cases.json. The body of run_case() is the web branch of
// chemsolve.php (empty checks, explode, solve_amounts, quantType rescale, sprintf "%.1f"),
// with the HTML echo statements replaced by collecting the same values into an array.
ini_set('display_errors', '0');
$GLOBALS['NOTICES'] = array();
set_error_handler(function ($no, $str) { $GLOBALS['NOTICES'][] = $str; return true; });
include("solve_amounts.phpi");

function enc_num($x) {
  if (is_int($x)) return array('int', (string)$x);
  if (is_float($x)) {
    if (is_nan($x)) return array('float', 'NaN');
    if (is_infinite($x)) return array('float', $x > 0 ? 'Infinity' : '-Infinity');
    return array('float', var_export($x, true));
  }
  return array(gettype($x), is_array($x) ? 'Array' : (string)$x);
}

function run_case($c) {
  $target = $c['target']; $source = $c['source']; $amount = $c['amount']; $quantType = $c['quantType'];
  if ($c['dummy'] !== null) $dummy = $c['dummy'];
  $rows = array(); $rxn = ''; $sub = '';
  // ---- chemsolve.php, web branch ----
  $doSolve = true;
  $solveOK = true;
  if (strlen($target) < 1 || strlen($source) < 1 || strlen($amount) < 1 || !isset($dummy)) {
      $doSolve = false;
      $solveOK = false;
      if (strlen($target) < 1)
          $errors[] = "Target Not Specified!";
      if (strlen($source) < 1)
          $errors[] = "Source Not Specified!";
      if (strlen($amount) < 1)
          $errors[] = "Amount Not Specified!";
      if (strlen($target) < 1 && strlen($source) < 1 && strlen($amount) < 1 && !isset($dummy))
          $errors = array();
  }
  if ($doSolve == true) {
      $result = solve_amounts($target, explode(",", $source), explode(",", $dummy), $amount);
      $warnings = $result[1];
      $errors = $result[2];
      $solveOK = $result[3];
  }
  if ($solveOK == true) {
    $rxn = $result[4];
    $sub = $result[5];
    if ($quantType == 2) { // quantity of product
      $productMass = end($result[0])[1];
      reset($result[0]);
      $mf = $amount/$productMass;
      for ($i = 0; $i < count($result[0]); $i++)
        $result[0][$i][1] = $result[0][$i][1] * $mf;
    }
    for ($i = 0; $i < count($result[0]); $i++)
      $rows[] = array($result[0][$i][0], enc_num($result[0][$i][1]), sprintf("%.1f", $result[0][$i][1]));
  }
  // ---- end ----
  return array('ok' => ($solveOK == true), 'rows' => $rows,
    'warnings' => isset($warnings) ? $warnings : array(),
    'errors' => isset($errors) ? $errors : array(),
    'reaction' => $rxn, 'mw' => $sub, 'fatal' => null);
}

$cases = json_decode(file_get_contents('/tmp/cases.json'), true);
$out = array();
foreach ($cases as $c) {
  $GLOBALS['NOTICES'] = array();
  try { $r = run_case($c); }
  catch (Throwable $e) { $r = array('ok' => false, 'rows' => array(), 'warnings' => array(), 'errors' => array(), 'reaction' => '', 'mw' => '', 'fatal' => get_class($e) . ': ' . $e->getMessage()); }
  $r['notices'] = array_values(array_unique($GLOBALS['NOTICES']));
  $out[] = $r;
}
echo json_encode($out, JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
