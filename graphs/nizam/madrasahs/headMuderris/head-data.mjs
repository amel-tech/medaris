// The walk data of nizam.madrasahs.headMuderris: a medrese of the walk's own, with an old başmüderris and what that başmüderris handed on, made and taken
// away through tedrisat's HTTP API. It is the binding's `setup`, `teardown` and `events`: `node ../nizam/madrasahs/headMuderris/head-data.mjs up|down|elsewhere ...`
// (the working directory is graphs/bindings/). It never touches a seeded medrese: the seeded başmüderris ("basmuderris") and "Hadis ve Siyer Medresesi" are not named here.
//
//   up --case active|bare|passive|handedOn|self
//        Makes the medrese "Başmüderris Deneme Medresesi" (handle baslik-deneme) as the başnazım (SYSTEM_ADMIN, POST /madrasahs) with the spare talebe APPLICANT_F ("Tahsin
//        Başvuran") as its başmüderris. A medrese of that handle made before is removed first, so a walk that died half way leaves nothing. What else is made depends on the case:
//        active     the old head gives two people something: APPLICANT_D ("Salih Başvuran") is appointed a medrese nazır and given madrasah.nazir_appoint and enrollment.decide
//                   (POST .../nazirs/:userId, then PUT .../nazirs/:userId/permissions, as APPLICANT_F), and APPLICANT_E ("Betül Başvuran") is appointed a nazır with nothing.
//                   The dialog lists two persons, D first (roles are listed oldest first, and the grants follow).
//        bare       the old head gives nobody anything: the dialog lists nobody.
//        passive    nothing is given; the medrese is made passive as the "Pasife al" dialog does (GET .../deactivation-preview, POST .../deactivate with its confirmation), so
//                   its head is off the post and its row has "Başmüderris ata".
//        handedOn   as `active`, and D, who holds madrasah.nazir_appoint, appoints APPLICANT_H ("Rıza Başvuran") a medrese nazır. H is not listed (D gave it, not the head), but
//                   it hangs under D's seat, so a Düşür for D is refused with DISMISS_SEAT_HANDED_ON.
//        self       as `active`, and the başnazım appoints E a Medaris nazımı holding platform.head_muderris_manage (POST /nizam/medaris-nazims). E is also a person the head
//                   gave a seat to, so a Devral for E's own row is a take-over of a row given to the caller: SELF_GRANT_REFUSED.
//        The ids, the words and the dates the binding reads are written to graphs/.local/made/headMuderris.json (the data source `made`):
//        {madrasah, name, handle, kind, endValid, endPast, oldHead, newHead, ...}. APPLICANT_G ("Dilek Başvuran") is the new head; the walk looks it up by e-mail.
//   elsewhere
//        What happens to the world while the dialog is open: the old head gives D one more permission (week.hide), so the list the dialog read is stale and the API
//        refuses the answers with DISMISS_DECISIONS_INCOMPLETE. Idempotent. It is the binding's event ELSEWHERE.
//   down
//        Takes everything away, safe to run twice and on a medrese that is already gone: the Medaris nazımı appointment of E (DELETE /nizam/medaris-nazims/:userId), the medrese
//        (DELETE /madrasahs/:id, as the başnazım alone may: its role assignments go with it), the permission grants of the medrese's scope (the one SQL statement of this file:
//        the delete leaves them behind and no route removes them), and the notifications the appointments sent to the spare accounts (helpers/notify.mjs clear). The audit rows
//        (madrasah.create, madrasah.head_muderris.set, madrasah.delete, permission.*, user.lookup) stay: no route removes them.
//
// Only spare talebe accounts are appointed. Prints one short line on stdout; a refusal is one line on stderr and a non-zero exit. Nothing secret is printed. Run by hand,
// every command takes the replay lock (CONVENTIONS, round R2). NOT RUN: written without a walk; `node --check` is the only thing it has met.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  call,
  Fail,
  LOCAL,
  must,
  nameOf,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HELPERS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bindings/helpers"
);
const OLD_HEAD = "applicantF"; // the sitting başmüderris
const NEW_HEAD = "applicantG"; // the person the walk finds by e-mail
const GIVEN_ROLE = "applicantD"; // a nazır the old head gave madrasah.nazir_appoint and enrollment.decide
const GIVEN_PLAIN = "applicantE"; // a nazır holding nothing; in `self` also a Medaris nazımı
const GIVEN_ON = "applicantH"; // the nazır D appoints in `handedOn`
const ALL = [OLD_HEAD, NEW_HEAD, GIVEN_ROLE, GIVEN_PLAIN, GIVEN_ON];
const HANDLE = "baslik-deneme";
const NAME = "Başmüderris Deneme Medresesi";
const DESCRIPTION =
  "Başmüderris atama ve değiştirme akışının denemesi için açılan medrese.";
const CODES = ["madrasah.nazir_appoint", "enrollment.decide"];
const EXTRA = "week.hide"; // what ELSEWHERE adds
const MEDARIS_CODE = "platform.head_muderris_manage";
const CASES = ["active", "bare", "passive", "handedOn", "self"];
const FILE = resolve(LOCAL, "made", "headMuderris.json");
const usage =
  "usage: head-data.mjs up --case active|bare|passive|handedOn|self | elsewhere | down";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// every medrese of this handle (hidden ones too), and the one recorded; a medrese is only ours if its handle AND its name are
async function ours() {
  const ids = new Set();
  if (read().madrasah) ids.add(read().madrasah);
  const listed = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/madrasahs/directory?status=ALL&limit=50&q=${encodeURIComponent(HANDLE)}`
  );
  for (const m of listed.body.items ?? [])
    if (
      (m.handle === HANDLE || m.handle.startsWith(`${HANDLE}-`)) &&
      m.name === NAME
    )
      ids.add(m.id);
  return [...ids].filter((id) => UUID.test(id));
}

async function down() {
  // E's appointment as a Medaris nazımı first: it gave nobody anything, so no answer is asked; 404 is "not one"
  const gone = await call(
    "SYSTEM_ADMIN",
    "DELETE",
    `/nizam/medaris-nazims/${subOf(GIVEN_PLAIN)}`,
    { decisions: [] }
  );
  if (gone.status !== 204 && gone.status !== 404)
    throw new Fail(
      `E's Medaris nazımı appointment was not ended (status ${gone.status} ${gone.body?.code ?? ""})`.trim()
    );
  const ids = await ours();
  for (const id of ids)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  // the delete takes the role assignments with it and leaves the permission grants of the scope: no route removes them
  if (ids.length > 0)
    helper(
      "sql.mjs",
      `delete from permission_grants where scope_id in (${ids.map((id) => `'${id}'`).join(", ")})`
    );
  for (const who of ALL) {
    try {
      helper("notify.mjs", who, "clear"); // an appointment told them; they start with no notification
    } catch {
      // a spare account that never signed in has no row: nothing to clear
    }
  }
  rmSync(FILE, { force: true });
  return ids.length;
}

// the day the end field is given: sixty days ahead, at noon, as `datetime-local` takes it, in the browser's zone (Europe/Istanbul)
function endValid() {
  const d = new Date(Date.now() + 60 * 24 * 3600 * 1000);
  const day = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  return `${day}T12:00`;
}

async function up(kind) {
  await down(); // a walk that died leaves nothing for this one
  const names = {};
  for (const who of ALL) names[who] = await nameOf(who); // also makes the `users` row exist
  const made = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name: NAME,
    handle: HANDLE,
    description: DESCRIPTION,
    headMuderrisUserId: subOf(OLD_HEAD),
  });
  const id = made.body.id;
  const m = `/madrasahs/${id}`;
  keep({
    madrasah: id,
    handle: HANDLE,
    name: NAME,
    kind,
    endValid: endValid(),
    endPast: "2020-01-01T12:00",
    oldHead: names[OLD_HEAD],
    newHead: names[NEW_HEAD],
    personD: names[GIVEN_ROLE],
    personE: names[GIVEN_PLAIN],
    personH: names[GIVEN_ON],
  });
  if (kind === "passive") {
    const preview = (
      await must("SYSTEM_ADMIN", "GET", `${m}/deactivation-preview`)
    ).body;
    await must("SYSTEM_ADMIN", "POST", `${m}/deactivate`, {
      confirmation: preview.confirmation,
    });
  } else if (kind !== "bare") {
    // the old head gives D a seat and two permissions, and E a seat
    await must(OLD_HEAD, "POST", `${m}/nazirs/${subOf(GIVEN_ROLE)}`);
    await must(
      OLD_HEAD,
      "PUT",
      `${m}/nazirs/${subOf(GIVEN_ROLE)}/permissions`,
      {
        groupId: null,
        permissions: CODES,
        courseIds: null,
        expiresAt: null,
      }
    );
    await must(OLD_HEAD, "POST", `${m}/nazirs/${subOf(GIVEN_PLAIN)}`);
    if (kind === "handedOn")
      await must(GIVEN_ROLE, "POST", `${m}/nazirs/${subOf(GIVEN_ON)}`);
    if (kind === "self")
      await must("SYSTEM_ADMIN", "POST", "/nizam/medaris-nazims", {
        userId: subOf(GIVEN_PLAIN),
        groupId: null,
        permissions: [MEDARIS_CODE],
        expiresAt: null,
      });
  }
  console.log(`ready: ${kind}, medrese ${NAME}`);
}

async function elsewhere() {
  const id = read().madrasah;
  if (!id) throw new Fail(`${FILE} has no medrese: run \`up\` first`);
  await must(
    OLD_HEAD,
    "PUT",
    `/madrasahs/${id}/nazirs/${subOf(GIVEN_ROLE)}/permissions`,
    {
      groupId: null,
      permissions: [...CODES, EXTRA],
      courseIds: null,
      expiresAt: null,
    }
  );
  console.log(`elsewhere: the old head gave ${EXTRA} to the first nazır`);
}

run("head-data", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  const o = options(rest, { values: ["case"] });
  if (o.rest.length) throw new Fail(usage, 2);
  if (verb === "up") {
    if (!CASES.includes(o.case)) throw new Fail(usage, 2);
    await up(o.case);
  } else if (verb === "elsewhere") {
    await elsewhere();
  } else if (verb === "down") {
    const n = await down();
    console.log(`removed: ${n} medrese${n === 1 ? "" : "s"}`);
  } else {
    throw new Fail(usage, 2);
  }
});
