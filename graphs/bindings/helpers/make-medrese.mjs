// A medrese of a walk's own, with a başmüderris of the walk's choosing and a hosting right in a köşk, so that a course can be opened in it
// (helpers/course.mjs make <course> --madrasah <id> --kosk <id>): made and taken away through tedrisat's HTTP API as the başnazım, by tag, so
// the seeded medrese is never touched (other flows read it). For the `setup`, `teardown` and `events` of nizam.moderation.restoreArchived
// and nizam.courses.list. Run from graphs/bindings/ (the replay's working directory):
//
//   node helpers/make-medrese.mjs make <tag> --kosk <kosk tag | id> --head <ACCOUNT>
//   node helpers/make-medrese.mjs hide --as <ACCOUNT> --tag <medrese tag> [--dry-run]
//   node helpers/make-medrese.mjs remove <tag>
//
// make    Opens the medrese "Deneme medresesi <tag>" (short name deneme-<tag>, lower case) as the başnazım (POST /madrasahs), with --head (a
//         spare talebe account; its own row is made first, with GET /me as the account) as its başmüderris, and gives it a hosting right in
//         the köşk (POST /kosks/<id>/hosting-rights). <kosk tag> is the tag of a köşk made by helpers/make-kosk.mjs (graphs/.local/made/
//         <kosk tag>.json), or give the köşk's id. A medrese made before under the tag is removed first. Prints {"tag","madrasah","name",
//         "handle","head","kosk"} and writes it to graphs/.local/made/<tag>.json the moment the medrese exists, so a crash half way is
//         still removable.
// hide    POST /madrasahs/:id/hide as that account, the medrese's başmüderris: the medrese and every course of it are hidden at the medrese's
//         kademe, so a nazım of the hosting köşk may bring a course back (köşk is above medrese) and is refused with ARCHIVE_PARENT_HIDDEN,
//         for the medrese is still hidden. Prints `hide-medrese <tag> by <ACCOUNT>`, or `hide-medrese <tag> already` when it was.
// remove  DELETE /madrasahs/:id as the başnazım (its hosting right and head go with it); the file goes too. Prints `remove-medrese <tag> <id>
//         removed`, or `remove-medrese <tag> none` when nothing is recorded; a medrese already gone is fine. Remove its courses first
//         (helpers/course.mjs remove <course tag>).
//
// What it cannot undo: the audit rows of the creation, the hide and the deletion and of the user lookup (audit_log is append-only by design).
// Every call is read from the controllers (madrasah.controller.ts:399,478,691; hosting.controller.ts:92). Run it under the replay lock when
// walks are running and you run it by hand. Nothing secret is printed.
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
} from "./lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: make-medrese.mjs make <tag> --kosk <kosk tag|id> --head <ACCOUNT> | hide --as <ACCOUNT> --tag <medrese tag> [--dry-run] | remove <tag>";
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

async function hideMedrese(o) {
  const made = recorded(o.tag, "medrese (helpers/make-medrese.mjs make)");
  const who = accountKey(o.as);
  const path = `/madrasahs/${made.madrasah}/hide`;
  if (o["dry-run"]) return `would POST ${path} as ${who}`;
  const r = await call(o.as, "POST", path);
  if (ok(r)) return `hide-medrese ${o.tag} by ${who}`;
  if (r.status === 409 && codeOf(r) === "MADRASAH_ALREADY_HIDDEN")
    return `hide-medrese ${o.tag} already`;
  throw new Fail(`${who} POST ${path}: ${refusal(r)}`);
}

run("make-medrese", async () => {
  const o = options(process.argv.slice(2), {
    values: ["as", "tag", "kosk", "head"],
    flags: ["dry-run"],
  });
  const [verb, tag, ...more] = o.rest;
  if (!verb || more.length) throw new Fail(usage, 2);
  if (verb === "make") {
    if (!tag || !/^[A-Za-z0-9]+$/.test(tag)) throw new Fail(usage, 2);
    console.log(JSON.stringify(await makeMedrese(tag, o)));
  } else if (verb === "hide") {
    if (tag || !o.as || !o.tag) throw new Fail(usage, 2);
    console.log(await hideMedrese(o));
  } else if (verb === "remove") {
    if (!tag) throw new Fail(usage, 2);
    console.log(`remove-medrese ${tag} ${await removeMedrese(tag)}`);
  } else throw new Fail(usage, 2);
});
