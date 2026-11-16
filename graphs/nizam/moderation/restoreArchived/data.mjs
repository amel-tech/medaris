#!/usr/bin/env node
// The data of nizam.moderation.restoreArchived's walks: a köşk of the walk's own with the köşk nazımı as its only nazım, the hides that give its Arşiv rows of different kademe, the
// restores a second person makes behind the page's back, and a medrese of the walk's own with a hosting right in that köşk. All through tedrisat's HTTP API, by tag, so the seeded
// köşks, the seeded medrese and every seeded course are never touched (other flows read them). Run from graphs/bindings/ (the replay's working directory) as
// `node ../nizam/moderation/restoreArchived/data.mjs <verb> ...`; the courses themselves are made by helpers/course.mjs.
//
//   data.mjs hide-course  --as <ACCOUNT> --tag <course tag>                [--dry-run]
//   data.mjs hide-week    --as <ACCOUNT> --tag <course tag> [--nth <n>]    [--dry-run]
//   data.mjs hide-session --as <ACCOUNT> --tag <course tag> [--nth <n>]    [--dry-run]
//   data.mjs restore      --as <ACCOUNT> --tag <course tag> [--type course|week|session] [--nth <n>] [--dry-run]
//
// (The köşk itself is helpers/make-kosk.mjs: `make arsKosk KOSK_NAZIM` and `remove arsKosk`, which writes graphs/.local/made/arsKosk.json, read by a binding as `mine`.)
// hide-course     POST /courses/:id/archive as that account: the course is stamped with the highest kademe the account holds on it. The köşk's nazım hides at the köşk's kademe, a
//                 medrese's başmüderris at the medrese's, the başnazım at the platform's, so the köşk's nazım sees the last as a sentence with no button. A course hidden already is
//                 `already`, not a failure. <course tag> is a course made by helpers/course.mjs (--nth is not used).
// hide-week       POST /courses/:id/weeks/:weekId/hide as that account, for the week at index <n> (0 is the first, the default): the week and its live sessions leave at one instant.
// hide-session    DELETE /lessons/:id as that account (`archiveLesson`), for the session at index <n> in programme order (0 is the first, the default): a session of a shown week is a row
//                 of its own in the Arşiv; one under a hidden week is not listed.
// restore         POST /archive/<type>/<id>/restore as that account: what a second person does behind the page's back (an item brought back first: the page's own press is then refused
//                 with ARCHIVE_ITEM_NOT_FOUND; brought back and hidden again at a higher kademe: ARCHIVE_RESTORE_LEVEL). `not hidden` when the item is not in the Arşiv.
// (The köşk and the medrese are helpers/make-kosk.mjs (`make arsKosk KOSK_NAZIM`, `remove arsKosk`) and helpers/make-medrese.mjs (`make arsMed --kosk arsKosk --head <ACCOUNT>`,
// `hide --as <ACCOUNT> --tag arsMed`, `remove arsMed`); the file of each is graphs/.local/made/<tag>.json.)
//
// What it cannot undo: the audit rows of the creations, hides, restores and deletions and of the user lookup (audit_log is append-only by design).
// NOT RUN: written without a replay (the owner's word: nothing writes to the stack before the walk phase). Every call is read from the controllers (kosk.controller.ts:310,367;
// madrasah.controller.ts:399,478,504,691; hosting.controller.ts:92; course.controller.ts:421,451; lesson.controller.ts:416,439; archive.controller.ts:246) and from the peer helpers
// nazar/archive/hideAndRestoreCourse/hide.mjs and nazar/archive/hideMedrese/medrese.mjs. Run it under the replay lock when walks are running and you run it by hand.
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
  "usage: data.mjs hide-course|hide-week|hide-session --as <ACCOUNT> --tag <course tag> [--nth <n>] | restore --as <ACCOUNT> --tag <course tag> [--type course|week|session] [--nth <n>]   (hide and restore take --dry-run)";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const codeOf = (r) =>
  r.body && typeof r.body === "object" ? (r.body.code ?? "") : "";
const ok = (r) => r.status >= 200 && r.status < 300;

function recorded(tag, what) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(
      `graphs/.local/made/${tag}.json does not exist: make the ${what} first`
    );
  return JSON.parse(readFileSync(fileOf(tag), "utf8"));
}

const nth = (o, list, what) => {
  const n = o.nth === undefined ? 0 : Number(o.nth);
  if (!Number.isInteger(n) || n < 0 || n >= list.length)
    throw new Fail(
      `--nth is a whole number from 0 to ${list.length - 1}: the course holds ${list.length} ${what}`,
      2
    );
  return list[n];
};

/** What a walk's own course holds: its id, weeks and sessions, from graphs/.local/made/<tag>.json (helpers/course.mjs make). */
function courseOf(o) {
  const made = recorded(o.tag, "course (helpers/course.mjs make)");
  if (!made.course) throw new Fail(`${o.tag} has no course recorded`);
  return made;
}

async function hide(verb, o) {
  const made = courseOf(o);
  const who = accountKey(o.as);
  let path;
  let method = "POST";
  if (verb === "hide-course") path = `/courses/${made.course}/archive`;
  else if (verb === "hide-week")
    path = `/courses/${made.course}/weeks/${nth(o, made.weeks ?? [], "weeks")}/hide`;
  else {
    method = "DELETE";
    path = `/lessons/${nth(o, made.lessons ?? [], "sessions")}`;
  }
  if (o["dry-run"]) return `would ${method} ${path} as ${who}`;
  const r = await call(o.as, method, path);
  if (ok(r)) return `${verb} ${o.tag} by ${who}`;
  if (r.status === 409 && codeOf(r) === "COURSE_ALREADY_HIDDEN")
    return `${verb} ${o.tag} already`;
  if (r.status === 404 && codeOf(r) === "WEEK_NOT_FOUND")
    return `${verb} ${o.tag} already`; // a week hidden already is no live week of the course
  throw new Fail(`${who} ${method} ${path}: ${refusal(r)}`);
}

async function restore(o) {
  const made = courseOf(o);
  const who = accountKey(o.as);
  const type = o.type ?? "course";
  const id =
    type === "course"
      ? made.course
      : type === "week"
        ? nth(o, made.weeks ?? [], "weeks")
        : type === "session"
          ? nth(o, made.lessons ?? [], "sessions")
          : null;
  if (!id) throw new Fail(`--type is course, week or session, not ${type}`, 2);
  const path = `/archive/${type}/${id}/restore`;
  if (o["dry-run"]) return `would POST ${path} as ${who}`;
  const r = await call(o.as, "POST", path);
  if (ok(r)) return `restore ${o.tag} ${type} by ${who}`;
  if (r.status === 404 && codeOf(r) === "ARCHIVE_ITEM_NOT_FOUND")
    return `restore ${o.tag} ${type} not hidden`;
  throw new Fail(`${who} POST ${path}: ${refusal(r)}`);
}

run("data", async () => {
  const o = options(process.argv.slice(2), {
    values: ["as", "tag", "nth", "type", "kosk", "head"],
    flags: ["dry-run"],
  });
  const [verb, ...more] = o.rest;
  if (!verb || more.length) throw new Fail(usage, 2);
  const needs = () => {
    if (!o.as || !o.tag) throw new Fail(usage, 2);
  };
  if (
    verb === "hide-course" ||
    verb === "hide-week" ||
    verb === "hide-session"
  ) {
    needs();
    console.log(await hide(verb, o));
  } else if (verb === "restore") {
    needs();
    console.log(await restore(o));
  } else throw new Fail(usage, 2);
});
