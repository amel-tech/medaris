#!/usr/bin/env node
// What the walks of nizam.nazims.appoint need beside the appointment itself, for a binding's `setup`, `teardown`, `events` and `effects`
// (`run` commands: no page exists then): the platform group the başnazım picks, the days the end field is typed with, the names the page
// prints, a record of what the walk typed, and a check of what the appointment left. All through tedrisat's HTTP API, as the başnazım
// (SYSTEM_ADMIN); no SQL.
//
// It does NOT appoint or dismiss anyone: the appointment is the walk's own story, and a person who is to hold a seat before the walk (the
// `already` scenario) and the dismissal in `teardown` are the job of the flow-local helper of nizam.home.medarisNazimCut,
// ../nizam/home/medarisNazimCut/nazim.mjs (`up`, `down`), which is reused here as it is. This file is only what that one does not do.
//
//   node ../nizam/nazims/appoint/appoint-data.mjs up
//       makes the platform group "Deneme grubu nzappt" (two permissions, platform.kosk_create and platform.kosk_edit; a live group of that
//       name is reused), reads the names of the başnazım, the spare (APPLICANT_E, the person appointed) and the other spare (APPLICANT_D,
//       the person who holds a seat already in the `already` scenario), computes the days, and writes graphs/.local/nzappt.json, a data source
//       of the binding ({appt.*}, below). `up` also makes the spare's users row (GET /me) and forgets what an earlier walk typed.
//   node ../nizam/nazims/appoint/appoint-data.mjs record <end|group|ticks> <value>
//       what an event of the walk has just typed or chosen: end none|soon|today|far|past, group none|chosen, ticks none|some. Written to
//       the data file, read by `verify`.
//   node ../nizam/nazims/appoint/appoint-data.mjs verify
//       reads the list as the başnazım and fails unless the spare holds the seat the walk recorded: the group when it was chosen, the single
//       permission when it was ticked, the end that was typed (the seat's and the earliest of the permissions are the same instant), and the
//       başnazım as the giver. Prints `appoint verify end=<..> group=<yes|no> singles=<n>`.
//   node ../nizam/nazims/appoint/appoint-data.mjs not-seated
//       fails when the spare holds a seat (a refused or an abandoned appointment writes nothing). Prints `appoint not-seated`.
//   node ../nizam/nazims/appoint/appoint-data.mjs still-other
//       fails unless the other spare still holds exactly what nazim.mjs gave it (platform.kosk_nazim_manage, no group, no end): the refused 409 changed
//       nothing. Prints `appoint still-other`.
//   node ../nizam/nazims/appoint/appoint-data.mjs gone
//       deletes the group as the başnazım (the race of `groupGone`: someone else deletes it while the dialog is open); none is not a failure.
//       Prints `appoint gone <n>`.
//   node ../nizam/nazims/appoint/appoint-data.mjs down
//       deletes the group (as `gone`) and removes the data file. Run it after nazim.mjs `down`, which dismisses the person (the group is
//       held by nobody then, so it may be deleted). Prints `appoint down <n>`.
//
// What the data file holds ({appt.<path>} in the binding):
//   sub, name, email         the spare: the person the walk appoints (APPLICANT_E)
//   otherSub, otherName, otherEmail   the other spare, who holds a seat already in `already` (APPLICANT_D)
//   chiefSub, chiefName      the başnazım, who appoints and is the giver
//   group.id, group.name     the group
//   today                    the day of the walk, as the page prints it ("15 Kasım 2026"): the day the new row says it was appointed
//   soon, todayEnd, far      { field, ms, label, days } the text the end field is typed with (YYYY-MM-DDTHH:mm, the zone of the page,
//                            Europe/Istanbul), the instant it means, the day as the list prints it, and the days left it says
//   past                     { field } an end that is not ahead (yesterday at noon)
//   typed                    { end, group, ticks }: what the walk has recorded
//
// The times are the ones the page uses: the viewer's zone is the app's default, Europe/Istanbul (UTC+3 all year). "today" ends at 23:59 of
// the day of the walk and fails when it is run after 23:50, because the dialog refuses an end that is not ahead. What these cannot undo: the
// audit rows (medaris_nazim.appoint, permission.grant, permission.revoke, user.lookup, permission_group.*), the revoked role and grant rows kept
// as history.
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
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const CHIEF = "SYSTEM_ADMIN";
const SPARE = "APPLICANT_E";
const OTHER = "APPLICANT_D";
const GROUP = "Deneme grubu nzappt";
const GROUP_CODES = ["platform.kosk_create", "platform.kosk_edit"];
const SINGLE = "platform.audit_read"; // the box the walk ticks
const OTHER_SINGLE = "platform.kosk_nazim_manage"; // what the other spare holds (nazim.mjs up, in `already`)
const DATA = resolve(LOCAL, "nzappt.json");
const DAY = 86_400_000;
const ZONE = "Europe/Istanbul";

const read = () => {
  if (!existsSync(DATA))
    throw new Fail(`${DATA} does not exist: run appoint-data.mjs up first`);
  return JSON.parse(readFileSync(DATA, "utf8"));
};
const keep = (data) => {
  mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
  writeFileSync(DATA, `${JSON.stringify(data)}\n`, { mode: 0o600 });
};

const label = (ms) =>
  new Intl.DateTimeFormat("tr", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  }).format(ms);
const dayOf = (ms) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(ms); // YYYY-MM-DD
// the end field's text and the instant it means, `days` from today at `time` (Istanbul has no summer time: +03:00 all year)
const at = (days, time) => {
  const day = dayOf(Date.now() + days * DAY);
  return {
    field: `${day}T${time}`,
    ms: Date.parse(`${day}T${time}:00+03:00`),
    days,
  };
};
const hourNow = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: ZONE,
    }).format(Date.now())
  );
const minuteNow = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      minute: "2-digit",
      timeZone: ZONE,
    }).format(Date.now())
  );

// the live platform group of that name, if there is one
async function findGroup() {
  const list =
    (await must(CHIEF, "GET", "/nizam/permission-groups")).body ?? [];
  return list.find((g) => g.name === GROUP && g.scope === "PLATFORM") ?? null;
}

async function makeGroup() {
  const found = await findGroup();
  if (found) return found;
  return (
    await must(CHIEF, "POST", "/nizam/permission-groups", {
      name: GROUP,
      scope: "PLATFORM",
      permissions: GROUP_CODES,
    })
  ).body;
}

async function dropGroup() {
  const found = await findGroup();
  if (!found) return 0;
  // nobody holds it by now (nazim.mjs down revoked the spare's grants); `revoke` is harmless when nobody does
  await must(
    CHIEF,
    "DELETE",
    `/nizam/permission-groups/${found.id}`,
    { usersPolicy: "revoke" },
    [404]
  );
  return 1;
}

async function up() {
  const nowHour = hourNow();
  if (nowHour === 23 && minuteNow() >= 50)
    throw new Fail(
      "it is too close to midnight (Istanbul) for the end 'later today'; run it after 00:00"
    );
  const group = await makeGroup();
  await must(SPARE, "GET", "/me"); // tedrisat makes the person's row at their first call
  await must(OTHER, "GET", "/me");
  const today = at(0, "23:59");
  const data = {
    sub: subOf(SPARE).toLowerCase(),
    name: await nameOf(SPARE),
    email: env()[`E2E_${accountKey(SPARE)}_EMAIL`],
    otherSub: subOf(OTHER).toLowerCase(),
    otherName: await nameOf(OTHER),
    otherEmail: env()[`E2E_${accountKey(OTHER)}_EMAIL`],
    chiefSub: subOf(CHIEF).toLowerCase(),
    chiefName: await nameOf(CHIEF),
    group: { id: group.id, name: group.name },
    today: label(Date.now()),
    soon: { ...at(5, "18:00"), label: null },
    todayEnd: today,
    far: { ...at(60, "12:00"), label: null },
    past: { field: `${dayOf(Date.now() - DAY)}T12:00` },
    typed: { end: "none", group: "none", ticks: "none" },
  };
  data.soon.label = label(data.soon.ms);
  data.todayEnd.label = label(data.todayEnd.ms);
  data.far.label = label(data.far.ms);
  keep(data);
  console.log("appoint up");
}

function record(args) {
  const [what, value, ...more] = args;
  const allowed = {
    end: ["none", "soon", "today", "far", "past"],
    group: ["none", "chosen"],
    ticks: ["none", "some"],
  };
  if (!allowed[what]?.includes(value) || more.length)
    throw new Fail(
      "usage: record end none|soon|today|far|past | group none|chosen | ticks none|some",
      2
    );
  const data = read();
  data.typed[what] = value;
  keep(data);
  console.log(`appoint record ${what}=${value}`);
}

const rowOf = async (sub) =>
  ((await must(CHIEF, "GET", "/nizam/medaris-nazims")).body ?? []).find(
    (r) => r.user?.id?.toLowerCase() === sub
  );

async function verify() {
  const data = read();
  const row = await rowOf(data.sub);
  if (!row)
    throw new Fail(`verify: ${data.email} holds no Medaris nazımı seat`);
  const { end, group, ticks } = data.typed;
  const problems = [];
  if (row.appointedBy?.id?.toLowerCase() !== data.chiefSub)
    problems.push(`appointed by ${row.appointedBy?.id}`);
  const groups = row.groups ?? [];
  if (group === "chosen") {
    if (
      !(
        groups.length === 1 &&
        groups[0].id === data.group.id &&
        groups[0].scope === "PLATFORM"
      )
    )
      problems.push(
        `groups ${JSON.stringify(groups.map((g) => g.name))}, wanted ${data.group.name}`
      );
  } else if (groups.length !== 0)
    problems.push(
      `groups ${JSON.stringify(groups.map((g) => g.name))}, wanted none`
    );
  const singles = (row.permissions ?? []).map((p) => p.code);
  const wanted = ticks === "some" ? [SINGLE] : [];
  if (
    singles.length !== wanted.length ||
    !wanted.every((c) => singles.includes(c))
  )
    problems.push(
      `single permissions ${JSON.stringify(singles)}, wanted ${JSON.stringify(wanted)}`
    );
  const expected =
    end === "none" ? null : end === "today" ? data.todayEnd.ms : data[end].ms;
  const seatEnd = row.assignmentExpiresAt
    ? Date.parse(row.assignmentExpiresAt)
    : null;
  const earliest = row.expiresAt ? Date.parse(row.expiresAt) : null;
  if (seatEnd !== expected)
    problems.push(
      `the seat ends ${row.assignmentExpiresAt}, wanted ${expected === null ? "never" : new Date(expected).toISOString()}`
    );
  if (earliest !== expected)
    problems.push(
      `the earliest end is ${row.expiresAt}, wanted ${expected === null ? "never" : new Date(expected).toISOString()}`
    );
  if (problems.length) throw new Fail(`verify: ${problems.join("; ")}`);
  console.log(
    `appoint verify end=${end} group=${group === "chosen" ? "yes" : "no"} singles=${singles.length}`
  );
}

async function notSeated() {
  const data = read();
  if (await rowOf(data.sub))
    throw new Fail(`not-seated: ${data.email} holds a seat`);
  console.log("appoint not-seated");
}

async function stillOther() {
  const data = read();
  const row = await rowOf(data.otherSub);
  if (!row) throw new Fail(`still-other: ${data.otherEmail} holds no seat`);
  const codes = (row.permissions ?? []).map((p) => p.code);
  if (
    (row.groups ?? []).length !== 0 ||
    row.assignmentExpiresAt !== null ||
    row.expiresAt !== null ||
    codes.length !== 1 ||
    codes[0] !== OTHER_SINGLE
  )
    throw new Fail(
      `still-other: ${data.otherEmail} holds ${JSON.stringify(codes)}, groups ${(row.groups ?? []).length}, end ${row.expiresAt}`
    );
  console.log("appoint still-other");
}

async function down() {
  const n = await dropGroup();
  if (existsSync(DATA)) rmSync(DATA);
  console.log(`appoint down ${n}`);
}

run("appoint-data", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "up" && rest.length === 0) await up();
  else if (verb === "record") record(rest);
  else if (verb === "verify" && rest.length === 0) await verify();
  else if (verb === "not-seated" && rest.length === 0) await notSeated();
  else if (verb === "still-other" && rest.length === 0) await stillOther();
  else if (verb === "gone" && rest.length === 0)
    console.log(`appoint gone ${await dropGroup()}`);
  else if (verb === "down" && rest.length === 0) await down();
  else
    throw new Fail(
      "usage: appoint-data.mjs up | record <end|group|ticks> <value> | verify | not-seated | still-other | gone | down",
      2
    );
});
