#!/usr/bin/env node
// The data of nizam.courses.list's walks: a köşk of the walk's own with the köşk nazımı as its only nazım, a medrese of the walk's own
// with a hosting right in that köşk, and the hides that give the Dersler table its hidden rows at different kademe. All through
// tedrisat's HTTP API, by tag, so the seeded köşks and the seeded medrese are never touched (other flows read them). Run from
// graphs/bindings/ (the replay's working directory); the courses themselves are made by helpers/course.mjs.
//
//   node ../nizam/courses/list/data.mjs make-kosk <tag> <MANAGER_ACCOUNT>
//   node ../nizam/courses/list/data.mjs make-medrese <tag> --kosk <kosk tag | id> --head <ACCOUNT>
//   node ../nizam/courses/list/data.mjs hide-course --as <ACCOUNT> --tag <course tag> [--dry-run]
//   node ../nizam/courses/list/data.mjs restore-course --as <ACCOUNT> --tag <course tag> [--dry-run]
//   node ../nizam/courses/list/data.mjs hide-medrese --as <ACCOUNT> --tag <medrese tag> [--dry-run]
//   node ../nizam/courses/list/data.mjs remove-medrese <tag>
//   node ../nizam/courses/list/data.mjs remove-kosk <tag>
//
// make-kosk       Opens the köşk "Deneme köşkü <tag>" (short name deneme-<tag>) as the başnazım (POST /kosks), with the account as its only
//                 nazım (the başnazım is never one: kosk.controller.ts:319). Prints {"tag","kosk","handle","manager"} and writes it to
//                 graphs/.local/made/<tag>.json, which a binding reads as a data source (`ncl: { json: ../.local/made/ncl.json }`, then
//                 `{ncl.kosk}`). A köşk of that short name made before is removed first.
// make-medrese    Opens the medrese "Deneme medresesi <tag>" as the başnazım, with --head (a spare talebe account) as its başmüderris, and gives
//                 it a hosting right in the köşk, which is what lets `helpers/course.mjs make <course> --madrasah <id> --kosk <id>` open
//                 courses of it there. Prints {"tag","madrasah","name","handle","head","kosk"}, written to graphs/.local/made/<tag>.json the
//                 moment the medrese exists, so a crash half way is still removable.
// hide-course     POST /courses/:id/archive as that account: the course is stamped with the highest kademe the account holds on it. The köşk's
//                 nazım hides at the köşk's kademe, the başnazım at the platform's, so the köşk nazım sees the second as a sentence with no
//                 button. A course hidden already is `already`, not a failure. <course tag> is a course made by helpers/course.mjs.
// restore-course  POST /courses/:id/restore as that account (what a second person does behind the page's back: the başnazım restores a
//                 course the nazım hid, and hides it again at his own kademe). A course shown already is `not hidden`.
// hide-medrese    POST /madrasahs/:id/hide as that account, the medrese's başmüderris: the medrese and every course of it are hidden at the
//                 medrese's kademe, so a nazım of the hosting köşk may bring a course back (köşk is above medrese) and is refused with
//                 ARCHIVE_PARENT_HIDDEN, for the medrese is still hidden. `already` when it was.
// remove-medrese  DELETE /madrasahs/:id as the başnazım (its hosting right and head go with it); the file goes too. `none` when nothing is
//                 recorded; a medrese already gone is fine. Remove its courses first (helpers/course.mjs remove <course tag>).
// remove-kosk     Deletes every köşk with the short name deneme-<tag> (DELETE /kosks/:id, which takes its role assignments and any course
//                 left in it, kosk.controller.ts:367), and the file. Safe to run twice: it says `removed 0` the second time.
//
// What it cannot undo: the audit rows of the creations, hides and deletions and of the user lookup (audit_log is append-only by design).
// NOT RUN: written without a replay (the owner's word: nothing writes to the stack before the walk phase). Every call is read from the
// controllers (kosk.controller.ts:310,367; madrasah.controller.ts:399,478,691; hosting.controller.ts:92; course.controller.ts:421,451) and
// from the peer helpers make-kosk.mjs (graphs/nizam/shell/noAccessAndNotFound) and passivate-data.mjs (graphs/nizam/madrasahs/passivate).
// Run it under the replay lock when walks are running and you run it by hand.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  call,
  Fail,
  LOCAL,
  must,
  options,
  refusal,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: data.mjs make-kosk <tag> <MANAGER> | make-medrese <tag> --kosk <tag|id> --head <ACCOUNT> | hide-course|restore-course --as <ACCOUNT> --tag <course tag> | hide-medrese --as <ACCOUNT> --tag <medrese tag> | remove-medrese <tag> | remove-kosk <tag>   (hide and restore take --dry-run)";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const handleOf = (tag) => `deneme-${tag}`;
const codeOf = (r) =>
  r.body && typeof r.body === "object" ? (r.body.code ?? "") : "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function keep(made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(made.tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

function recorded(tag, what) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(
      `graphs/.local/made/${tag}.json does not exist: make the ${what} first`
    );
  return JSON.parse(readFileSync(fileOf(tag), "utf8"));
}

/** The köşks of that short name, as the directory the başnazım reads lists them. */
async function koskWithHandle(handle) {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  return (found.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === handle
  );
}

async function removeKosk(tag) {
  const same = await koskWithHandle(handleOf(tag));
  for (const k of same) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
  rmSync(fileOf(tag), { force: true });
  return `removed ${same.length}`;
}

async function makeKosk(tag, manager) {
  await removeKosk(tag); // a tag made before goes first
  const handle = handleOf(tag);
  const created = (
    await must("SYSTEM_ADMIN", "POST", "/kosks", {
      name: `Deneme köşkü ${tag}`,
      handle,
      managerUserIds: [subOf(manager)],
    })
  ).body;
  if (!created?.id) throw new Fail("POST /kosks answered no id");
  const made = { tag, kosk: created.id, handle, manager: accountKey(manager) };
  keep(made);
  return made;
}

async function removeMedrese(tag) {
  if (!existsSync(fileOf(tag))) return "none";
  const made = JSON.parse(readFileSync(fileOf(tag), "utf8"));
  if (made.madrasah)
    await must(
      "SYSTEM_ADMIN",
      "DELETE",
      `/madrasahs/${made.madrasah}`,
      undefined,
      [404] // a medrese already gone is fine
    );
  rmSync(fileOf(tag), { force: true });
  return `${made.madrasah ?? "no medrese"} removed`;
}

async function makeMedrese(tag, o) {
  if (!o.kosk || !o.head) throw new Fail(usage, 2);
  await removeMedrese(tag);
  const kosk = UUID.test(o.kosk) ? o.kosk : recorded(o.kosk, "köşk").kosk;
  await must(o.head, "GET", "/me"); // the head's row in tedrisat's users table
  const name = `Deneme medresesi ${tag}`;
  const handle = handleOf(tag).slice(0, 60);
  const created = (
    await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
      name,
      handle,
      headMuderrisUserId: subOf(o.head),
    })
  ).body;
  if (!created?.id) throw new Fail("POST /madrasahs answered no id");
  const made = {
    tag,
    madrasah: created.id,
    name,
    handle,
    head: accountKey(o.head),
    kosk: null,
  };
  keep(made); // at once: a failure below is still removable
  await must("SYSTEM_ADMIN", "POST", `/kosks/${kosk}/hosting-rights`, {
    madrasahId: made.madrasah,
  });
  made.kosk = kosk;
  keep(made);
  return made;
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

async function hideMedrese(o) {
  const made = recorded(o.tag, "medrese (data.mjs make-medrese)");
  const who = accountKey(o.as);
  const path = `/madrasahs/${made.madrasah}/hide`;
  if (o["dry-run"]) return `would POST ${path} as ${who}`;
  const r = await call(o.as, "POST", path);
  if (r.status >= 200 && r.status < 300)
    return `hide-medrese ${o.tag} by ${who}`;
  if (r.status === 409 && codeOf(r) === "MADRASAH_ALREADY_HIDDEN")
    return `hide-medrese ${o.tag} already`;
  throw new Fail(`${who} POST ${path}: ${refusal(r)}`);
}

run("data", async () => {
  const o = options(process.argv.slice(2), {
    values: ["as", "tag", "kosk", "head"],
    flags: ["dry-run"],
  });
  const [verb, tag, manager, ...more] = o.rest;
  if (!verb || more.length) throw new Fail(usage, 2);
  if (verb === "make-kosk") {
    if (!tag || !manager || !/^[a-z0-9]+$/.test(tag))
      throw new Fail(
        `a köşk tag is lower-case letters and digits, and a MANAGER account follows: ${usage}`,
        2
      );
    console.log(JSON.stringify(await makeKosk(tag, manager)));
  } else if (verb === "make-medrese") {
    if (!tag || manager || !/^[a-z0-9]+$/.test(tag)) throw new Fail(usage, 2);
    console.log(JSON.stringify(await makeMedrese(tag, o)));
  } else if (verb === "hide-course" || verb === "restore-course") {
    if (tag || !o.as || !o.tag) throw new Fail(usage, 2);
    console.log(await hideOrRestoreCourse(verb, o));
  } else if (verb === "hide-medrese") {
    if (tag || !o.as || !o.tag) throw new Fail(usage, 2);
    console.log(await hideMedrese(o));
  } else if (verb === "remove-medrese") {
    if (!tag || manager) throw new Fail(usage, 2);
    console.log(`data remove-medrese ${tag}: ${await removeMedrese(tag)}`);
  } else if (verb === "remove-kosk") {
    if (!tag || manager) throw new Fail(usage, 2);
    console.log(`data remove-kosk ${tag}: ${await removeKosk(tag)}`);
  } else throw new Fail(usage, 2);
});
