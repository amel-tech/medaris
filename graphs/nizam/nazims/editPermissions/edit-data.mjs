#!/usr/bin/env node
// What the walks of nizam.nazims.editPermissions need beyond a bare Medaris nazımı: a ready platform group, the seat given that group, two
// single permissions and an end (or none), the days the end field is typed with, what the page's save is checked against, and the two
// events that happen to the seat while the dialog is open. All through tedrisat's HTTP API as the başnazım (SYSTEM_ADMIN), no SQL.
//
// The appointment itself (and its end) is helpers/nazim.mjs's `up --group <id> --end <instant>`, which this file runs as a child; `down` of
// the same helper dismisses the seat (before `up` and in the teardown, and for the event "the person is dismissed while the dialog is open"),
// and this file does the rest. The seat is applicantD ("Salih Başvuran"), a spare talebe; never the seeded Medaris nazımı.
//
//   node ../nizam/nazims/editPermissions/edit-data.mjs up [--forever]
//       makes the group "Deneme grubu epDialog" (PLATFORM scope: platform.audit_read, platform.inactive_scopes_manage) if it is not there, appoints
//       applicantD with that group, the single permissions platform.madrasah_create and platform.deck_publish and an end twenty days ahead at 18:00
//       in Istanbul (--forever: no end), writes graphs/.local/editperm.json (the binding's data source `ep`) and prints `edit-data up`.
//       It fails when applicantD already holds a seat: run `helpers/nazim.mjs down applicantD` first (the binding does).
//   node ../nizam/nazims/editPermissions/edit-data.mjs held [--group chosen|none] [--deck ticked|unticked] [--end ahead|none]
//       reads the seat as the başnazım and fails unless it holds what is asked: `group` the walk's group or no group, `deck` platform.deck_publish
//       as a single permission or not, `end` an end (the row's `expiresAt`) or none. platform.madrasah_create must always be held. Prints
//       `held group=<..> deck=<..> end=<..>`.
//   node ../nizam/nazims/editPermissions/edit-data.mjs drop-group
//       the event "the group is deleted while the dialog is open": DELETE /nizam/permission-groups/<id> with usersPolicy keep, so the seat keeps the
//       group's permissions as single ones and the page, which still lists the group, sends a group that is not there (PERMISSION_GROUP_NOT_FOUND).
//   node ../nizam/nazims/editPermissions/edit-data.mjs shorten
//       the event "the appointment now ends sooner than the page says": dismisses the seat and appoints it again with the same group and singles and
//       an end two hours ahead, so an end the page let through is after the appointment's (GRANT_EXPIRY_INVALID).
//   node ../nizam/nazims/editPermissions/edit-data.mjs down
//       deletes the group (usersPolicy revoke if somebody still holds it) and removes the data file; safe to run twice. Dismiss the seat first
//       (`nazim.mjs down applicantD`).
//
// Times are the ones the page uses: the viewer's zone is the app's default, Europe/Istanbul (+03:00 all year), and the end field takes
// `YYYY-MM-DDTHH:mm`. What these cannot undo: the audit rows (medaris_nazim.appoint, permission.grant, permission.revoke, permission.group_*), and the
// revoked rows kept as history. Run it under the replay lock when walks are running and you run it by hand. Not run when written (the owner
// moved every replay to the end): every call below is from the code and the domain's description of it.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Fail,
  LOCAL,
  must,
  nameOf,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const ADMIN = "SYSTEM_ADMIN";
const SPARE = "APPLICANT_D";
const GROUP = "Deneme grubu epDialog";
const GROUP_CODES = ["platform.audit_read", "platform.inactive_scopes_manage"];
const SINGLES = ["platform.madrasah_create", "platform.deck_publish"];
const FILE = resolve(LOCAL, "editperm.json");
const HELPERS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bindings/helpers"
);
const DAY = 86_400_000;
const ZONE = "Europe/Istanbul";

const read = () => {
  if (!existsSync(FILE))
    throw new Fail(`${FILE} does not exist: run \`edit-data.mjs up\` first`);
  return JSON.parse(readFileSync(FILE, "utf8"));
};

/** `YYYY-MM-DD` of an instant on the clock of Istanbul. */
const dayOf = (at) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
/** A day as the page writes it (formatDay of features/permissions/present.ts: "15 Aralık 2026"). */
const dayLabel = (at) =>
  new Intl.DateTimeFormat("tr", {
    timeZone: ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
/** A moment as the page writes it (formatMoment: "15 Aralık 2026 18:00"). */
const momentLabel = (at) =>
  new Intl.DateTimeFormat("tr", {
    timeZone: ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
const at = (day, time) => new Date(`${day}T${time}:00+03:00`);

const rows = async () =>
  (await must(ADMIN, "GET", "/nizam/medaris-nazims")).body;
const rowOf = async (sub) =>
  (await rows()).find((r) => r.user?.id?.toLowerCase() === sub.toLowerCase());
const groups = async () =>
  (await must(ADMIN, "GET", "/nizam/permission-groups")).body;
const groupOf = async () => (await groups()).find((g) => g.name === GROUP);

async function ensureGroup() {
  const found = await groupOf();
  if (found) return found;
  return (
    await must(ADMIN, "POST", "/nizam/permission-groups", {
      name: GROUP,
      scope: "PLATFORM",
      permissions: GROUP_CODES,
    })
  ).body;
}

// the appointment, as the shared helper makes it: the group and the two single permissions, and an end or none
function appoint(groupId, expiresAt) {
  const r = spawnSync(
    process.execPath,
    [
      resolve(HELPERS, "nazim.mjs"),
      "up",
      SPARE,
      "--codes",
      SINGLES.join(","),
      "--group",
      groupId,
      ...(expiresAt ? ["--end", expiresAt.toISOString()] : []),
    ],
    { cwd: HELPERS, encoding: "utf8" }
  );
  if (r.status !== 0)
    throw new Fail(
      `nazim.mjs up: ${(r.stderr || r.stdout).trim().split("\n").pop()}`
    );
}

async function up({ forever }) {
  const sub = subOf(SPARE);
  await must(SPARE, "GET", "/me"); // tedrisat makes the person's row at their first call; the appointment names it
  if (await rowOf(sub))
    throw new Fail(
      `up: ${SPARE} already holds a Medaris nazımı seat; run nazim.mjs down applicantD first`
    );
  const group = await ensureGroup();
  const now = Date.now();
  const endAt = forever ? null : at(dayOf(now + 20 * DAY), "18:00");
  appoint(group.id, endAt);
  const row = await rowOf(sub);
  if (!row)
    throw new Fail("up: the seat is not in the list after the appointment");
  const later = at(dayOf(now + 10 * DAY), "12:00");
  const beyond = at(dayOf(now + 30 * DAY), "12:00");
  const data = {
    sub,
    name: await nameOf(SPARE),
    email: row.user.email,
    giver: row.appointedBy?.name ?? "",
    today: dayLabel(now),
    group: GROUP,
    groupId: group.id,
    // the appointment's own end, as the page writes it in the list, in the dialog's help line, and as the field holds it
    endDay: endAt ? dayLabel(endAt) : "",
    endMoment: endAt ? momentLabel(endAt) : "",
    endInput: endAt ? `${dayOf(endAt)}T18:00` : "",
    daysLeft: endAt ? "20" : "",
    // what the end field is typed with: a moment ahead and before the appointment's end; one after it (a dated seat) and one in the past
    later: `${dayOf(later)}T12:00`,
    laterDay: dayLabel(later),
    beyond: `${dayOf(beyond)}T12:00`,
    past: `${dayOf(now - 30 * DAY)}T12:00`,
  };
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`edit-data up ${SPARE} ${forever ? "forever" : "dated"}`);
}

async function held(opts) {
  const d = read();
  const row = await rowOf(d.sub);
  if (!row) throw new Fail("held: the person holds no Medaris nazımı seat");
  const codes = row.permissions.map((p) => p.code);
  if (!codes.includes("platform.madrasah_create"))
    throw new Fail(
      `held: platform.madrasah_create is gone (holds ${codes.join(",") || "none"})`
    );
  const seen = {
    group: row.groups.some((g) => g.scope === "PLATFORM" && g.id === d.groupId)
      ? "chosen"
      : "none",
    deck: codes.includes("platform.deck_publish") ? "ticked" : "unticked",
    end: row.expiresAt ? "ahead" : "none",
  };
  for (const k of ["group", "deck", "end"])
    if (opts[k] !== undefined && opts[k] !== seen[k])
      throw new Fail(`held: ${k} is ${seen[k]}, wanted ${opts[k]}`);
  console.log(`held group=${seen.group} deck=${seen.deck} end=${seen.end}`);
}

async function dropGroup() {
  const d = read();
  const found = (await groups()).find((g) => g.id === d.groupId);
  if (!found) {
    console.log("edit-data drop-group none");
    return;
  }
  await must(ADMIN, "DELETE", `/nizam/permission-groups/${d.groupId}`, {
    usersPolicy: "keep",
  });
  console.log("edit-data drop-group 1");
}

async function shorten() {
  const d = read();
  const row = await rowOf(d.sub);
  if (!row) throw new Fail("shorten: the person holds no seat");
  // what the person handed on to others must be answered; this spare hands nothing on
  const given =
    (await must(ADMIN, "GET", `/nizam/medaris-nazims/${d.sub}/given`)).body ??
    [];
  const decisions = given
    .filter(
      (g) =>
        (g.kind === "ROLE" || g.kind === "GRANT") && g.to && g.to.id !== d.sub
    )
    .map((g) => ({ kind: g.kind, id: g.id, action: "DROP" }));
  await must(ADMIN, "DELETE", `/nizam/medaris-nazims/${d.sub}`, { decisions });
  appoint(d.groupId, new Date(Date.now() + 2 * 3_600_000));
  console.log("edit-data shorten 2h");
}

async function down() {
  let said = "group=none";
  try {
    const found = await groupOf();
    if (found) {
      await must(
        ADMIN,
        "DELETE",
        `/nizam/permission-groups/${found.id}`,
        found.userCount > 0 ? { usersPolicy: "revoke" } : {}
      );
      said = "group=1";
    }
  } finally {
    rmSync(FILE, { force: true });
  }
  console.log(`edit-data down ${said}`);
}

run("edit-data", async () => {
  const [command, ...args] = process.argv.slice(2);
  const o = options(args, {
    flags: ["forever"],
    values: ["group", "deck", "end"],
  });
  if (command === "up") await up(o);
  else if (command === "held") await held(o);
  else if (command === "drop-group") await dropGroup();
  else if (command === "shorten") await shorten();
  else if (command === "down") await down();
  else
    throw new Fail(
      "usage: edit-data.mjs up [--forever] | held [--group ..] [--deck ..] [--end ..] | drop-group | shorten | down",
      2
    );
});
