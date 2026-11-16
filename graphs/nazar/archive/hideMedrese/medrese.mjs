// The walk data of nazar.archive.hideMedrese: a medrese of the walk's own, so that the walk never hides the seeded one. It is the binding's
// `setup`, `teardown`, `events` and `effects`: `node medrese.mjs up|down|admin|state ...`, run from graphs/bindings/ as
// `node ../nazar/archive/hideMedrese/medrese.mjs ...`. Only tedrisat's HTTP API is used (no SQL).
//
//   up              Makes the medrese "Gizleme Denemesi Medresesi" (handle gizleme-denemesi), with the spare talebe account APPLICANT_H as its
//                   başmüderris, as the başnazım (SYSTEM_ADMIN) through POST /madrasahs, and gives it a hosting right in the seed's second köşk
//                   (POST /kosks/<kosk2>/hosting-rights), the köşk no seeded flow reads, so that a course can be opened in it. A medrese made
//                   before (by its handle) is deleted first, so a walk that died half way leaves nothing. The id goes to
//                   graphs/.local/made/hideMedrese-medrese.json, which the binding reads as the data source `mine` ({mine.madrasah}).
//   down            Deletes it (DELETE /madrasahs/<id>, as the başnazım alone may), whatever state it ended in: hidden or shown. The role of the
//                   başmüderris goes with it. `none` when nothing is recorded or found.
//   admin hide      The başnazım hides it, in another browser (POST /madrasahs/<id>/hide as SYSTEM_ADMIN), so it is hidden at the platform
//                   level, which the başmüderris cannot bring back.
//   admin restore   The başnazım brings it back (POST /madrasahs/<id>/restore).
//   admin rehide    restore, then hide at the platform level: what a başmüderris who hid it, and a başnazım who brought it back and hid it again,
//                   leave behind.
//   state           What the başmüderris is told, read as her (GET /madrasahs/<id>/archive?types=course), on one line:
//                   `medrese SHOWN hiddenCourses=0` or
//                   `medrese HIDDEN level=madrasah byHead=yes canRestore=yes hiddenCourses=1 sameInstant=yes`.
//
// The course in it is made by helpers/course.mjs (`make hideMedrese --madrasah <id>`), not here. Everything is told in one short line on stdout;
// a refusal is one line on stderr and a non-zero exit. Nothing secret is printed. Run by hand, every command takes the replay lock (CONVENTIONS,
// round R2).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  Fail,
  LOCAL,
  must,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HEAD = "APPLICANT_H";
const HANDLE = "gizleme-denemesi";
const NAME = "Gizleme Denemesi Medresesi";
const FILE = resolve(LOCAL, "made", "hideMedrese-medrese.json");
const usage =
  "usage: medrese.mjs up | down | admin hide|restore|rehide | state";

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
    {
      mode: 0o600,
    }
  );
}

// every medrese with the walk's handle, hidden ones too, and the one recorded
async function ours() {
  const ids = new Set();
  const known = recorded();
  if (known) ids.add(known);
  const listed = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/madrasahs/directory?status=ALL&limit=50&q=${encodeURIComponent(HANDLE)}`
  );
  for (const m of listed.body.items ?? [])
    if (m.handle === HANDLE || m.handle.startsWith(`${HANDLE}-`)) ids.add(m.id);
  return [...ids];
}

async function remove() {
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

async function down() {
  const ids = await remove();
  console.log(`medrese down ${ids.length ? ids.join(" ") : "none"}`);
}

function need() {
  const id = recorded();
  if (!id) throw new Fail("no medrese is recorded: run `up` first");
  return id;
}

async function admin(what) {
  const id = need();
  if (what === "hide" || what === "rehide") {
    if (what === "rehide")
      await must("SYSTEM_ADMIN", "POST", `/madrasahs/${id}/restore`);
    await must("SYSTEM_ADMIN", "POST", `/madrasahs/${id}/hide`);
  } else if (what === "restore")
    await must("SYSTEM_ADMIN", "POST", `/madrasahs/${id}/restore`);
  else throw new Fail(usage, 2);
  console.log(`medrese admin ${what} ${id}`);
}

async function state() {
  const id = need();
  const read = await must(
    HEAD,
    "GET",
    `/madrasahs/${id}/archive?types=course&limit=50`
  );
  const { madrasah: m, items } = read.body;
  if (!m.hidden)
    return console.log(`medrese SHOWN hiddenCourses=${items.length}`);
  const byHead =
    m.hiddenBy?.id?.toLowerCase() === subOf(HEAD).toLowerCase() ? "yes" : "no";
  const same =
    items.length > 0 &&
    items.every((i) => Date.parse(i.archivedAt) === Date.parse(m.hiddenAt))
      ? "yes"
      : "no";
  console.log(
    `medrese HIDDEN level=${m.hiddenLevel} byHead=${byHead} canRestore=${m.canRestore ? "yes" : "no"} hiddenCourses=${items.length} sameInstant=${same}`
  );
}

run("medrese", async () => {
  const [verb, what, ...more] = process.argv.slice(2);
  if (more.length) throw new Fail(usage, 2);
  if (verb === "up" && !what) return up();
  if (verb === "down" && !what) return down();
  if (verb === "admin" && what) return admin(what);
  if (verb === "state" && !what) return state();
  throw new Fail(usage, 2);
});
