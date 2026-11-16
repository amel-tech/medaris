#!/usr/bin/env node
// The data of nizam.moderation.restoreArchived's walks: a köşk of the walk's own with the köşk nazımı as its only nazım, the hides that give its Arşiv rows of different kademe, the
// restores a second person makes behind the page's back, and a medrese of the walk's own with a hosting right in that köşk. All through tedrisat's HTTP API, by tag, so the seeded
// köşks, the seeded medrese and every seeded course are never touched (other flows read them). Run from graphs/bindings/ (the replay's working directory) as
// `node ../nizam/moderation/restoreArchived/data.mjs <verb> ...`; the courses themselves are made by helpers/course.mjs.
//
//   data.mjs make-kosk <tag> <MANAGER_ACCOUNT>
//   data.mjs remove-kosk <tag>
//   data.mjs hide-course  --as <ACCOUNT> --tag <course tag>                [--dry-run]
//   data.mjs hide-week    --as <ACCOUNT> --tag <course tag> [--nth <n>]    [--dry-run]
//   data.mjs hide-session --as <ACCOUNT> --tag <course tag> [--nth <n>]    [--dry-run]
//   data.mjs restore      --as <ACCOUNT> --tag <course tag> [--type course|week|session] [--nth <n>] [--dry-run]
//   data.mjs make-medrese <tag> --kosk <kosk tag | id> --head <ACCOUNT>
//   data.mjs hide-medrese --as <ACCOUNT> --tag <medrese tag>               [--dry-run]
//   data.mjs remove-medrese <tag>
//
// make-kosk       Opens the köşk "Deneme köşkü <tag>" (short name deneme-<tag>, lower case) as the başnazım (POST /kosks), with the account as its only nazım (the başnazım is never
//                 one: kosk.controller.ts:319). Prints {"tag","kosk","handle","name","manager"} and writes it to graphs/.local/made/<tag>.json, which a binding reads as a data source
//                 (`mine: { json: ../.local/made/arsKosk.json }`, then `{mine.kosk}`, `{mine.name}`). A köşk of that short name made before is removed first.
// remove-kosk     Deletes every köşk with that short name (DELETE /kosks/:id, the başnazım's alone, which takes its role assignments and every course left in it), and the file. Safe to
//                 run twice: `removed 0` the second time.
// hide-course     POST /courses/:id/archive as that account: the course is stamped with the highest kademe the account holds on it. The köşk's nazım hides at the köşk's kademe, a
//                 medrese's başmüderris at the medrese's, the başnazım at the platform's, so the köşk's nazım sees the last as a sentence with no button. A course hidden already is
//                 `already`, not a failure. <course tag> is a course made by helpers/course.mjs (--nth is not used).
// hide-week       POST /courses/:id/weeks/:weekId/hide as that account, for the week at index <n> (0 is the first, the default): the week and its live sessions leave at one instant.
// hide-session    DELETE /lessons/:id as that account (`archiveLesson`), for the session at index <n> in programme order (0 is the first, the default): a session of a shown week is a row
//                 of its own in the Arşiv; one under a hidden week is not listed.
// restore         POST /archive/<type>/<id>/restore as that account: what a second person does behind the page's back (an item brought back first: the page's own press is then refused
//                 with ARCHIVE_ITEM_NOT_FOUND; brought back and hidden again at a higher kademe: ARCHIVE_RESTORE_LEVEL). `not hidden` when the item is not in the Arşiv.
// make-medrese    Opens the medrese "Deneme medresesi <tag>" as the başnazım, with --head (a spare talebe account) as its başmüderris, and gives it a hosting right in the köşk, which is
//                 what lets `helpers/course.mjs make <course> --madrasah <id> --kosk <id>` open courses of it there. Prints {"tag","madrasah","name","handle","head","kosk"}, written to
//                 graphs/.local/made/<tag>.json the moment the medrese exists, so a crash half way is still removable.
// hide-medrese    POST /madrasahs/:id/hide as that account, the medrese's başmüderris: the medrese and every shown course of it are hidden at the medrese's kademe, so a nazım of the
//                 hosting köşk may bring a course back (köşk is above medrese) and is refused with ARCHIVE_PARENT_HIDDEN, for the medrese is still hidden. `already` when it was.
// remove-medrese  DELETE /madrasahs/:id as the başnazım (its hosting right and head go with it); the file goes too. `none` when nothing is recorded; a medrese already gone is fine.
//                 Remove its courses first (helpers/course.mjs remove <course tag>).
//
// What it cannot undo: the audit rows of the creations, hides, restores and deletions and of the user lookup (audit_log is append-only by design).
// NOT RUN: written without a replay (the owner's word: nothing writes to the stack before the walk phase). Every call is read from the controllers (kosk.controller.ts:310,367;
// madrasah.controller.ts:399,478,504,691; hosting.controller.ts:92; course.controller.ts:421,451; lesson.controller.ts:416,439; archive.controller.ts:246) and from the peer helpers
// nazar/archive/hideAndRestoreCourse/hide.mjs and nazar/archive/hideMedrese/medrese.mjs. Run it under the replay lock when walks are running and you run it by hand.
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
  "usage: data.mjs make-kosk <tag> <MANAGER> | remove-kosk <tag> | hide-course|hide-week|hide-session --as <ACCOUNT> --tag <course tag> [--nth <n>] | restore --as <ACCOUNT> --tag <course tag> [--type course|week|session] [--nth <n>] | make-medrese <tag> --kosk <kosk tag|id> --head <ACCOUNT> | hide-medrese --as <ACCOUNT> --tag <medrese tag> | remove-medrese <tag>   (hide and restore take --dry-run)";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const handleOf = (tag) => `deneme-${tag}`.toLowerCase();
const codeOf = (r) =>
  r.body && typeof r.body === "object" ? (r.body.code ?? "") : "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (r) => r.status >= 200 && r.status < 300;

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
  if (!manager) throw new Fail(usage, 2);
  await removeKosk(tag); // a tag made before goes first
  const handle = handleOf(tag);
  const name = `Deneme köşkü ${tag}`;
  await must(manager, "GET", "/me"); // the manager's row in tedrisat's users table
  const created = (
    await must("SYSTEM_ADMIN", "POST", "/kosks", {
      name,
      handle,
      managerUserIds: [subOf(manager)],
    })
  ).body;
  if (!created?.id) throw new Fail("POST /kosks answered no id");
  const made = {
    tag,
    kosk: created.id,
    handle,
    name,
    manager: accountKey(manager),
  };
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

async function hideMedrese(o) {
  const made = recorded(o.tag, "medrese (data.mjs make-medrese)");
  const who = accountKey(o.as);
  const path = `/madrasahs/${made.madrasah}/hide`;
  if (o["dry-run"]) return `would POST ${path} as ${who}`;
  const r = await call(o.as, "POST", path);
  if (ok(r)) return `hide-medrese ${o.tag} by ${who}`;
  if (r.status === 409 && codeOf(r) === "MADRASAH_ALREADY_HIDDEN")
    return `hide-medrese ${o.tag} already`;
  throw new Fail(`${who} POST ${path}: ${refusal(r)}`);
}

run("data", async () => {
  const o = options(process.argv.slice(2), {
    values: ["as", "tag", "nth", "type", "kosk", "head"],
    flags: ["dry-run"],
  });
  const [verb, first, second, ...more] = o.rest;
  if (!verb || more.length) throw new Fail(usage, 2);
  const needs = () => {
    if (!o.as || !o.tag) throw new Fail(usage, 2);
  };
  if (verb === "make-kosk") {
    if (!first) throw new Fail(usage, 2);
    console.log(JSON.stringify(await makeKosk(first, second)));
  } else if (verb === "remove-kosk") {
    if (!first || second) throw new Fail(usage, 2);
    console.log(`remove-kosk ${first} ${await removeKosk(first)}`);
  } else if (
    verb === "hide-course" ||
    verb === "hide-week" ||
    verb === "hide-session"
  ) {
    needs();
    console.log(await hide(verb, o));
  } else if (verb === "restore") {
    needs();
    console.log(await restore(o));
  } else if (verb === "make-medrese") {
    if (!first || second) throw new Fail(usage, 2);
    console.log(JSON.stringify(await makeMedrese(first, o)));
  } else if (verb === "hide-medrese") {
    needs();
    console.log(await hideMedrese(o));
  } else if (verb === "remove-medrese") {
    if (!first || second) throw new Fail(usage, 2);
    console.log(`remove-medrese ${first} ${await removeMedrese(first)}`);
  } else throw new Fail(usage, 2);
});
