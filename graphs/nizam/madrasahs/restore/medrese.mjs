// The walk data of nizam.madrasahs.restore: a medrese of the walk's own, with one course in it, hidden before the walk begins, so that the
// walk never hides, restores or deletes the seeded one. It is the binding's `setup`, `teardown`, `events` and `effects`:
// `node medrese.mjs <verb> ...`, run from graphs/bindings/ as `node ../nizam/madrasahs/restore/medrese.mjs ...`. Only tedrisat's HTTP API
// is used (no SQL). Written to the shape of nazar/archive/hideMedrese/medrese.mjs, which makes a medrese for its own handle; the two use
// different handles and different records, so the walks of both can run in turn.
//
//   up               Makes the medrese "Geri Alma Denemesi Medresesi" (handle geri-alma-denemesi), with the spare talebe account
//                    APPLICANT_G as its başmüderris, as the başnazım (SYSTEM_ADMIN) through POST /madrasahs, and gives it a hosting right
//                    in the seed's second köşk (POST /kosks/<kosk2>/hosting-rights), the köşk no seeded flow reads, so that a course can be
//                    opened in it (helpers/course.mjs does that). A medrese made before (found by its handle) is taken away first, so a walk
//                    that died half way leaves nothing. The id goes to graphs/.local/made/restoreMedrese-medrese.json, which the binding
//                    reads as the data source `mine` ({mine.madrasah}).
//   hide [--by head|chief]
//                    Hides it: by its başmüderris (the default, level `madrasah`, as that account through POST /madrasahs/<id>/hide) or by
//                    the başnazım (level `platform`). The medrese's courses are hidden at the same instant. `already` when it is hidden.
//   restore [--by chief|head]
//                    Brings it back as the başnazım (the default) or as the başmüderris, who may only bring back what was hidden at her
//                    own level. A refusal fails the command: this is another person's step in a race, and it must really happen.
//   thaw             Brings it back as the başnazım if it is hidden; `already` when it is shown, `gone` when there is none. Never fails for
//                    those two: it is what `teardown` runs before the course is removed (a hidden course is not removed by its route).
//   delete           Another person's step in a race: thaws the medrese and deletes it (DELETE /madrasahs/<id>, the başnazım's alone). Its
//                    course stays, in its köşk, with no medrese (the API says so), and `teardown` removes it.
//   state            What the başnazım's table says of it (GET /madrasahs/directory?q=<handle>, the answer Medreseler draws), on one line:
//                      `medrese HIDDEN level=madrasah canRestore=yes head=yes courses=0`
//                      `medrese ACTIVE head=yes courses=1`      `medrese GONE`
//                    `courses` counts the courses that are not hidden: the one course is hidden with the medrese and comes back with it.
//   down             Thaws it, then deletes it, whatever state it is in. The başmüderris's role goes with the medrese. `none` when nothing is
//                    recorded or found.
//
// The one course is made by helpers/course.mjs (`make restoreMedrese --madrasah <id> --kosk <kosk2> ...`), not here, and removed by it
// (`remove restoreMedrese`), after `thaw`. Everything is told in one short line on stdout; a refusal is one line on stderr and a non-zero
// exit. Nothing secret is printed. Run by hand, every command takes the replay lock (CONVENTIONS, round R2).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  call,
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HEAD = "APPLICANT_G";
const HANDLE = "geri-alma-denemesi";
const NAME = "Geri Alma Denemesi Medresesi";
const FILE = resolve(LOCAL, "made", "restoreMedrese-medrese.json");
const usage =
  "usage: medrese.mjs up | hide [--by head|chief] | restore [--by chief|head] | thaw | delete | state | down";

function recorded() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")).madrasah ?? null;
  } catch {
    return null;
  }
}

function keep(id) {
  mkdirSync(dirname(FILE), { recursive: true, mode: 0o700 });
  writeFileSync(
    FILE,
    `${JSON.stringify({ madrasah: id, handle: HANDLE, name: NAME })}\n`,
    { mode: 0o600 }
  );
}

// the medreses with the walk's handle (a numbered one too, if the server made one), hidden ones as well, as the başnazım's table lists them
async function listed() {
  const read = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/madrasahs/directory?status=ALL&limit=50&q=${encodeURIComponent(HANDLE)}`
  );
  return (read.body.items ?? []).filter(
    (m) => m.handle === HANDLE || m.handle.startsWith(`${HANDLE}-`)
  );
}

// every id that is ours: the recorded one, and what the table finds by the handle
async function ours() {
  const ids = new Set();
  const known = recorded();
  if (known) ids.add(known);
  for (const m of await listed()) ids.add(m.id);
  return [...ids];
}

// the one medrese this walk reads, as the table lists it; null when there is none
async function mine() {
  const id = recorded();
  const items = await listed();
  return items.find((m) => m.id === id) ?? items[0] ?? null;
}

const who = (by, fallback) => {
  const v = by ?? fallback;
  if (v !== "head" && v !== "chief") throw new Fail(usage, 2);
  return v === "head" ? HEAD : "SYSTEM_ADMIN";
};

function need() {
  const id = recorded();
  if (!id) throw new Fail("no medrese is recorded: run `up` first");
  return id;
}

// brings back what is hidden, as the başnazım; says what it found
async function thawAll() {
  let found = "gone";
  for (const m of await listed()) {
    if (m.status === "HIDDEN") {
      await must("SYSTEM_ADMIN", "POST", `/madrasahs/${m.id}/restore`);
      found = "thawed";
    } else if (found === "gone") found = "already";
  }
  return found;
}

async function remove() {
  await thawAll();
  const ids = await ours();
  for (const id of ids)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  rmSync(FILE, { force: true });
  return ids;
}

async function up() {
  await remove();
  const made = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name: NAME,
    handle: HANDLE,
    headMuderrisUserId: subOf(HEAD),
  });
  const id = made.body.id;
  keep(id); // recorded at once: a failure below is still removable
  await must("SYSTEM_ADMIN", "POST", `/kosks/${seed().kosk2}/hosting-rights`, {
    madrasahId: id,
  });
  console.log(`medrese up ${id}`);
}

async function hide(by) {
  const id = need();
  const r = await call(who(by, "head"), "POST", `/madrasahs/${id}/hide`);
  if (r.status === 409) return console.log(`medrese hide already ${id}`);
  if (r.status < 200 || r.status >= 300)
    throw new Fail(
      `${by ?? "head"} POST /madrasahs/${id}/hide answered ${r.status}`
    );
  console.log(`medrese hide ${by ?? "head"} ${id}`);
}

async function restore(by) {
  const id = need();
  await must(who(by, "chief"), "POST", `/madrasahs/${id}/restore`);
  console.log(`medrese restore ${by ?? "chief"} ${id}`);
}

async function thaw() {
  console.log(`medrese thaw ${await thawAll()}`);
}

async function del() {
  const id = need();
  await thawAll();
  await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`);
  console.log(`medrese delete ${id}`);
}

async function state() {
  const m = await mine();
  if (!m) return console.log("medrese GONE");
  const head =
    m.headMuderris?.id?.toLowerCase() === subOf(HEAD).toLowerCase()
      ? "yes"
      : "no";
  if (m.status === "HIDDEN")
    return console.log(
      `medrese HIDDEN level=${m.hiddenLevel} canRestore=${m.canRestore ? "yes" : "no"} head=${head} courses=${m.courseCount}`
    );
  console.log(`medrese ${m.status} head=${head} courses=${m.courseCount}`);
}

async function down() {
  const ids = await remove();
  console.log(`medrese down ${ids.length ? ids.join(" ") : "none"}`);
}

run("medrese", async () => {
  const { rest, by } = options(process.argv.slice(2), { values: ["by"] });
  const [verb, ...more] = rest;
  if (more.length) throw new Fail(usage, 2);
  if (by !== undefined && verb !== "hide" && verb !== "restore")
    throw new Fail(usage, 2);
  if (verb === "up") return up();
  if (verb === "hide") return hide(by);
  if (verb === "restore") return restore(by);
  if (verb === "thaw") return thaw();
  if (verb === "delete") return del();
  if (verb === "state") return state();
  if (verb === "down") return down();
  throw new Fail(usage, 2);
});
