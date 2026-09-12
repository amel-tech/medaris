/**
 * The one shape every `tools/ci/assert-*.mjs` gate prints in.
 *
 * `check()` prints a `✔ label` or a `✖ label` plus an indented detail line and
 * records the failure; the caller decides what to do with the accumulated list
 * (each gate has its own closing summary). `sorted` and `sameSet` are the two
 * set helpers every gate needs to compare a declared list against a measured
 * one. They used to be copied into each script; the copies had already started
 * to be the thing the next script copied, so they live here now.
 *
 * Deliberately tiny: anything a single gate needs — an `abort`, a `notes`
 * list — stays in that gate.
 */

/**
 * @returns {{ check: (ok: boolean, label: string, detail: string) => void, failures: string[] }}
 */
export function createChecker() {
  const failures = [];

  function check(ok, label, detail) {
    if (ok) {
      console.log(`✔ ${label}`);
    } else {
      console.log(`✖ ${label}\n    ${detail}`);
      failures.push(label);
    }
  }

  return { check, failures };
}

export function sorted(list) {
  return [...list].sort();
}

export function sameSet(a, b) {
  const x = sorted(a);
  const y = sorted(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
