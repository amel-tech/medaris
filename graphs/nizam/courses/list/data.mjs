#!/usr/bin/env node
// The data of nizam.courses.list's walks: a köşk of the walk's own with the köşk nazımı as its only nazım, a medrese of the walk's own
// with a hosting right in that köşk, and the hides that give the Dersler table its hidden rows at different kademe. All through
// tedrisat's HTTP API, by tag, so the seeded köşks and the seeded medrese are never touched (other flows read them). Run from
// graphs/bindings/ (the replay's working directory); the courses themselves are made by helpers/course.mjs.
//
//   node ../nizam/courses/list/data.mjs hide-course --as <ACCOUNT> --tag <course tag> [--dry-run]
//   node ../nizam/courses/list/data.mjs restore-course --as <ACCOUNT> --tag <course tag> [--dry-run]
//
// (The köşk itself is helpers/make-kosk.mjs: `make ncl KOSK_NAZIM` and `remove ncl`, which writes graphs/.local/made/ncl.json, read by a binding as `ncl`.)
// (The köşk and the medrese are helpers/make-kosk.mjs (`make ncl KOSK_NAZIM`) and helpers/make-medrese.mjs (`make nclm --kosk ncl --head <ACCOUNT>`, `hide --as <ACCOUNT> --tag nclm`,
// `remove nclm`); the file of each is graphs/.local/made/<tag>.json.)
// hide-course     POST /courses/:id/archive as that account: the course is stamped with the highest kademe the account holds on it. The köşk's
//                 nazım hides at the köşk's kademe, the başnazım at the platform's, so the köşk nazım sees the second as a sentence with no
//                 button. A course hidden already is `already`, not a failure. <course tag> is a course made by helpers/course.mjs.
// restore-course  POST /courses/:id/restore as that account (what a second person does behind the page's back: the başnazım restores a
//                 course the nazım hid, and hides it again at his own kademe). A course shown already is `not hidden`.
//
// What it cannot undo: the audit rows of the creations, hides and deletions and of the user lookup (audit_log is append-only by design).
// NOT RUN: written without a replay (the owner's word: nothing writes to the stack before the walk phase). Every call is read from the
// controllers (kosk.controller.ts:310,367; madrasah.controller.ts:399,478,691; hosting.controller.ts:92; course.controller.ts:421,451) and
// from the peer helpers helpers/make-kosk.mjs and passivate-data.mjs (graphs/nizam/madrasahs/passivate).
// Run it under the replay lock when walks are running and you run it by hand.
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

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: data.mjs hide-course|restore-course --as <ACCOUNT> --tag <course tag>   (hide and restore take --dry-run)";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const codeOf = (r) =>
  r.body && typeof r.body === "object" ? (r.body.code ?? "") : "";

function recorded(tag, what) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(
      `graphs/.local/made/${tag}.json does not exist: make the ${what} first`
    );
  return JSON.parse(readFileSync(fileOf(tag), "utf8"));
}

async function hideOrRestoreCourse(verb, o) {
  const made = recorded(o.tag, "course (helpers/course.mjs make)");
  if (!made.course) throw new Fail(`${o.tag} has no course recorded`);
  const who = accountKey(o.as);
  const hide = verb === "hide-course";
  const path = `/courses/${made.course}/${hide ? "archive" : "restore"}`;
  if (o["dry-run"]) return `would POST ${path} as ${who}`;
  const r = await call(o.as, "POST", path);
  if (r.status >= 200 && r.status < 300) return `${verb} ${o.tag} by ${who}`;
  if (hide && r.status === 409 && codeOf(r) === "COURSE_ALREADY_HIDDEN")
    return `${verb} ${o.tag} already`;
  if (!hide && r.status === 409 && codeOf(r) === "COURSE_NOT_HIDDEN")
    return `${verb} ${o.tag} not hidden`;
  throw new Fail(`${who} POST ${path}: ${refusal(r)}`);
}

run("data", async () => {
  const o = options(process.argv.slice(2), {
    values: ["as", "tag", "kosk", "head"],
    flags: ["dry-run"],
  });
  const [verb, ...more] = o.rest;
  if (!verb || more.length) throw new Fail(usage, 2);
  if (verb === "hide-course" || verb === "restore-course") {
    if (!o.as || !o.tag) throw new Fail(usage, 2);
    console.log(await hideOrRestoreCourse(verb, o));
  } else throw new Fail(usage, 2);
});
