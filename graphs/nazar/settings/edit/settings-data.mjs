// The walk data of nazar.settings.edit: a medrese of the walk's own, so that the walk never changes a seeded medrese's settings. It is the
// binding's `setup`, `teardown`, `before` and `effects`: `node settings-data.mjs up|down|break|state ...`, run from graphs/bindings/ as
// `node ../nazar/settings/edit/settings-data.mjs ...`. Only tedrisat's HTTP API is used, through helpers/lib.mjs (and helpers/course.mjs
// as a command); no SQL.
//
//   up [--saved] [--courses]
//        Makes the medrese "Ayarlar Deneme Medresesi" (handle ayarlar-deneme) with a description, as the başnazım (SYSTEM_ADMIN, POST /madrasahs),
//        with the spare talebe APPLICANT_C as its başmüderris. A medrese made before (by its handle) is removed first, so a walk that died half
//        way leaves nothing. The medrese is NEVER SAVED: it has no settings row, every policy reads off and "Son değişiklik" is empty.
//        --saved    the başmüderris saves once (PATCH /madrasahs/<id>/settings, alwaysApproval on), as the e2e's seed has it: the medrese then
//                   reads "Kayıt her zaman onaylı" checked and a "Son değişiklik <today> · <her name>" line.
//        --courses  gives the medrese's courses a hosting right in the seed's second köşk (POST /kosks/<kosk2>/hosting-rights, the köşk no
//                   seeded flow reads) and makes three courses in it through helpers/course.mjs: a published one, a draft and a hidden
//                   one (POST /madrasahs/<id>/courses/<courseId>/hide). The page lists the first two, never the hidden one.
//        The ids and the words the binding reads are written to graphs/.local/made/settingsEdit.json (the data source `made`):
//        {madrasah, name, description, person, today, koskName, ...}.
//   down
//        Takes everything away: the three courses (course.mjs remove: they go with their celses), the medrese (DELETE /madrasahs/<id>, as the
//        başnazım alone may; its settings row, hosting right and role assignments go with it), and the notification the head's appointment sent
//        to APPLICANT_C (helpers/notify.mjs clear). Safe to run twice and on a medrese that is already gone. The audit rows of the walk
//        (madrasah.create, madrasah.settings.update, madrasah.delete, hosting_right.grant) stay: no route removes them.
//   break head | gone
//        What happens to the medrese while the başmüderris's page is open, so that Kaydet is answered with a refusal:
//        head   the başnazım takes the head's seat (PUT /madrasahs/<id>/head-muderris, userId = SYSTEM_ADMIN's own, which the başnazım may), so the
//               save is AUTHZ_FORBIDDEN; idempotent.
//        gone   the başnazım deletes the medrese, so the save is MADRASAH_NOT_FOUND (read from the domain, not seen: the guard may answer 403).
//   state
//        The settings as the başmüderris (or, after `break head`, the başnazım) reads them, on one line of JSON, for an `effects` check:
//        {"name":...,"description":...,"closedCourseRequired":b,"alwaysApproval":b,"noPublicRecordings":b,"saved":b}.
//
// Prints one short line on stdout; a refusal is one line on stderr and a non-zero exit. Nothing secret is printed. Run by hand, every command
// takes the replay lock (CONVENTIONS, round R2).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HELPERS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bindings/helpers"
);
const HEAD = "APPLICANT_C"; // the başmüderris of the walk's medrese: a spare talebe "Esma Başvuran", with nothing else
const HANDLE = "ayarlar-deneme";
const NAME = "Ayarlar Deneme Medresesi";
const DESCRIPTION = "Medrese ayarları sayfasının denemesi için açılan medrese.";
const TAGS = ["settings-pub", "settings-draft", "settings-hid"]; // the three courses, by their course.mjs tags
const FILE = resolve(LOCAL, "made", "settingsEdit.json");
const usage =
  "usage: settings-data.mjs up [--saved] [--courses] | down | break head|gone | state";

const read = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
};
function keep(patch) {
  mkdirSync(dirname(FILE), { recursive: true, mode: 0o700 });
  writeFileSync(FILE, `${JSON.stringify({ ...read(), ...patch })}\n`, {
    mode: 0o600,
  });
}

// another helper of graphs/bindings/helpers, run as a command; its failure is one line
function helper(file, ...args) {
  try {
    return execFileSync(process.execPath, [resolve(HELPERS, file), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    throw new Fail(
      `${file} ${args.join(" ")}: ${String(e.stderr || e.message).trim()}`
    );
  }
}

// every medrese of this handle (hidden ones too), and the one recorded
async function ours() {
  const ids = new Set();
  if (read().madrasah) ids.add(read().madrasah);
  const listed = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/madrasahs/directory?status=ALL&limit=50&q=${encodeURIComponent(HANDLE)}`
  );
  for (const m of listed.body.items ?? [])
    if (m.handle === HANDLE || m.handle.startsWith(`${HANDLE}-`)) ids.add(m.id);
  return [...ids];
}

async function down() {
  for (const tag of TAGS) helper("course.mjs", "remove", tag);
  const ids = await ours();
  for (const id of ids)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  helper("notify.mjs", HEAD, "clear"); // the appointment as başmüderris told her; she starts with no notification
  rmSync(FILE, { force: true });
  return ids;
}

async function up(flags) {
  await down(); // a walk that died leaves nothing for this one
  const made = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name: NAME,
    handle: HANDLE,
    description: DESCRIPTION,
    headMuderrisUserId: subOf(HEAD),
  });
  const id = made.body.id;
  const me = (await must(HEAD, "GET", "/me")).body;
  keep({
    madrasah: id,
    handle: HANDLE,
    name: NAME,
    description: DESCRIPTION,
    person: await nameOf(HEAD),
    saved: false,
  });
  if (flags.saved) {
    await must(HEAD, "PATCH", `/madrasahs/${id}/settings`, {
      policies: { alwaysApproval: true },
    });
    keep({ saved: true });
  }
  // "Son değişiklik <date>": the date in the head's zone, as the page words it (dayFormat: dateStyle long, locale tr)
  keep({
    today: new Intl.DateTimeFormat("tr", {
      dateStyle: "long",
      timeZone: me.timeZone || "Europe/Istanbul",
    }).format(new Date()),
  });
  if (flags.courses) {
    const kosk = seed().kosk2;
    await must("SYSTEM_ADMIN", "POST", `/kosks/${kosk}/hosting-rights`, {
      madrasahId: id,
    });
    const common = [
      "--madrasah",
      id,
      "--kosk",
      kosk,
      "--weeks",
      "1",
      "--lessons",
      "1",
    ];
    const published = JSON.parse(
      helper("course.mjs", "make", TAGS[0], ...common)
    );
    const draft = JSON.parse(
      helper("course.mjs", "make", TAGS[1], ...common, "--draft")
    );
    const hidden = JSON.parse(helper("course.mjs", "make", TAGS[2], ...common));
    await must(
      "SYSTEM_ADMIN",
      "POST",
      `/madrasahs/${id}/courses/${hidden.course}/hide`
    );
    keep({
      koskName: seed().titles.kosk2,
      published: published.title,
      draft: draft.title,
      hidden: hidden.title,
    });
  }
  return `up ${id}${flags.saved ? " saved" : ""}${flags.courses ? " courses" : ""}`;
}

async function breakIt(how) {
  const { madrasah: id } = read();
  if (!id) throw new Fail("no medrese is recorded: run `up` first");
  if (how === "head") {
    const delegations = (
      await must(
        "SYSTEM_ADMIN",
        "GET",
        `/madrasahs/${id}/head-muderris/delegations`
      )
    ).body;
    await must("SYSTEM_ADMIN", "PUT", `/madrasahs/${id}/head-muderris`, {
      userId: subOf("SYSTEM_ADMIN"),
      delegations: (delegations ?? []).map((d) => ({
        kind: d.kind,
        id: d.id,
        action: "TAKE_OVER",
      })),
    });
    keep({ head: "SYSTEM_ADMIN" });
  } else if (how === "gone") {
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  } else throw new Fail(usage, 2);
  return `break ${how} ${id}`;
}

async function state() {
  const { madrasah: id, head } = read();
  if (!id) throw new Fail("no medrese is recorded: run `up` first");
  const s = (await must(head ?? HEAD, "GET", `/madrasahs/${id}/settings`)).body;
  return JSON.stringify({
    name: s.name,
    description: s.description,
    closedCourseRequired: s.policies.closedCourseRequired,
    alwaysApproval: s.policies.alwaysApproval,
    noPublicRecordings: s.policies.noPublicRecordings,
    saved: s.updatedAt !== null,
  });
}

run("settings-data", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "up") {
    const flags = {};
    for (const a of rest) {
      if (a !== "--saved" && a !== "--courses") throw new Fail(usage, 2);
      flags[a.slice(2)] = true;
    }
    console.log(await up(flags));
  } else if (verb === "down") {
    if (rest.length) throw new Fail(usage, 2);
    const ids = await down();
    console.log(`down ${ids.length ? ids.join(" ") : "none"}`);
  } else if (verb === "break") {
    if (rest.length !== 1) throw new Fail(usage, 2);
    console.log(await breakIt(rest[0]));
  } else if (verb === "state") {
    if (rest.length) throw new Fail(usage, 2);
    console.log(await state());
  } else throw new Fail(usage, 2);
});
