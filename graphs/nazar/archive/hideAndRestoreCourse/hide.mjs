// Walk data of nazar.archive.hideAndRestoreCourse: hides what a walk's own course holds, as one of the stack's accounts, through
// tedrisat's HTTP API, so that the Arşiv of the seeded medrese has rows of each kademe and more than ten of them. It is the binding's
// `setup` (and, for one scenario, its `before`): `node ../nazar/archive/hideAndRestoreCourse/hide.mjs <verb> ...` from graphs/bindings/.
//
//   hide-course --as <ACCOUNT> --tag <tag> [--dry-run]
//       POST /courses/:id/archive as that account: the course is stamped with the highest kademe the account holds on it. The başmüderris
//       hides at the medrese's, the köşk's nazım at the köşk's, the başnazım at the platform's, so the başmüderris sees the last two as a
//       sentence with no button (Archive.locked, Archive.lockedAdmin). A course hidden already is `already`, not a failure.
//   hide-weeks --as <ACCOUNT> --tag <tag> [--count <n>] [--dry-run]
//       POST /courses/:id/weeks/:weekId/hide for the first <n> weeks of the course (all of them by default), one after the other, so each
//       week has its own instant and the Arşiv lists the newest first. A week hidden already is skipped.
//
// <tag> is a course made by helpers/course.mjs (graphs/.local/made/<tag>.json holds its id and its weeks). ACCOUNT is a role key of
// graphs/.local/accounts.env or the binding's name for it (basmuderris, koskNazim, systemAdmin). Prints one line: `hide-course <tag> by
// <ACCOUNT>`, `hide-course <tag> already`, `hide-weeks <tag> <n>`. --dry-run prints the calls it would make and makes none. Nothing
// secret is printed. Run it under the replay lock when walks are running and you run it by hand.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  call,
  Fail,
  LOCAL,
  options,
  refusal,
  run,
} from "../../../bindings/helpers/lib.mjs";

const usage =
  "usage: hide.mjs hide-course --as <ACCOUNT> --tag <tag> [--dry-run] | hide-weeks --as <ACCOUNT> --tag <tag> [--count <n>] [--dry-run]";

function madeOf(tag) {
  const file = resolve(LOCAL, "made", `${tag}.json`);
  if (!existsSync(file))
    throw new Fail(
      `graphs/.local/made/${tag}.json does not exist: make the course first (helpers/course.mjs make ${tag} ...)`
    );
  return JSON.parse(readFileSync(file, "utf8"));
}

const codeOf = (r) =>
  r.body && typeof r.body === "object" ? (r.body.code ?? "") : "";

run("hide", async () => {
  const opts = options(process.argv.slice(2), {
    values: ["as", "tag", "count"],
    flags: ["dry-run"],
  });
  const [verb] = opts.rest;
  if (opts.rest.length !== 1 || !opts.as || !opts.tag) throw new Fail(usage, 2);
  const made = madeOf(opts.tag);
  if (!made.course) throw new Fail(`${opts.tag} has no course recorded`);
  const who = accountKey(opts.as);

  if (verb === "hide-course") {
    const path = `/courses/${made.course}/archive`;
    if (opts["dry-run"]) {
      console.log(`would POST ${path} as ${who}`);
      return;
    }
    const r = await call(opts.as, "POST", path);
    if (r.status >= 200 && r.status < 300)
      console.log(`hide-course ${opts.tag} by ${who}`);
    else if (r.status === 409 && codeOf(r) === "COURSE_ALREADY_HIDDEN")
      console.log(`hide-course ${opts.tag} already`);
    else throw new Fail(`${who} POST ${path}: ${refusal(r)}`);
  } else if (verb === "hide-weeks") {
    const all = made.weeks ?? [];
    const n = opts.count === undefined ? all.length : Number(opts.count);
    if (!Number.isInteger(n) || n < 0 || n > all.length)
      throw new Fail(`--count is a whole number from 0 to ${all.length}`, 2);
    for (const week of all.slice(0, n)) {
      const path = `/courses/${made.course}/weeks/${week}/hide`;
      if (opts["dry-run"]) {
        console.log(`would POST ${path} as ${who}`);
        continue;
      }
      const r = await call(opts.as, "POST", path);
      const gone = r.status === 404 && codeOf(r) === "WEEK_NOT_FOUND"; // hidden already
      if (!(r.status >= 200 && r.status < 300) && !gone)
        throw new Fail(`${who} POST ${path}: ${refusal(r)}`);
    }
    if (!opts["dry-run"]) console.log(`hide-weeks ${opts.tag} ${n}`);
  } else throw new Fail(usage, 2);
});
