// What nazar.nazirs.permissions needs on top of `helpers/course.mjs make nzperm --madrasah <id>` (the course is made and removed there):
// a spare talebe account made a nazır of the seeded medrese, a permission group of the walk's own, the dates of the end field, and the
// events that take something away while the editor is open. It is the flow's setup, its events and its teardown:
//
//   node ../nazar/nazirs/permissions/permissions-data.mjs up [--holds]   the nazır, the group, the dates; writes graphs/.local/nazir-permissions.json
//   node ../nazar/nazirs/permissions/permissions-data.mjs held [same|profile|nothing|record]   what the nazır holds now, and a check of it
//   node ../nazar/nazirs/permissions/permissions-data.mjs dismiss        the nazır leaves the roster (the event: it happens while the page is open)
//   node ../nazar/nazirs/permissions/permissions-data.mjs drop-group     the walk's group is deleted (the event: the editor still lists it)
//   node ../nazar/nazirs/permissions/permissions-data.mjs clean | down   takes everything `up` made away; safe to run twice
//
// The nazır is applicantF (a spare talebe with a full profile and no enrolment; `nazar.nazirs.appoint` takes applicantE). Nothing seeded is
// touched: the seeded nazır (Seher Medrese Nazırı) is never given or taken anything, the seeded courses are only read, and the group is
// named "İzin grubu nzperm", which no other flow uses. Everything goes through tedrisat's HTTP API as the başmüderris; no SQL.
//
// up       Makes the account's `users` row exist (GET /me as it), appoints it a nazır of the medrese (POST /madrasahs/:id/nazirs/:userId,
//          which holds nothing and is a no-op when it already is one), defines the group "İzin grubu nzperm" with the two course
//          permissions enrollment.decide and enrollment.complete (POST /madrasahs/:id/permission-groups, scope COURSE; one made before is
//          deleted first), reads the walk's course from graphs/.local/made/nzperm.json, and computes the dates of the end field in Istanbul
//          time: `future` is thirty days from now at 23:59, `past` thirty days ago at 12:00. With --holds the nazır is given what the
//          flow's profile is, through the same route the editor saves with: the group, the single permission week.hide, the walk's course
//          only and the future end (PUT /madrasahs/:id/nazirs/:userId/permissions).
//          The file holds {madrasah, sub, name, email, groupId, groupName, course, courseTitle, future, futureIso, futureLabel, past, last}:
//          `last` is what the nazır was known to hold (`nothing`, the profile or `gone`) and `held same` compares with it.
// held     No argument: prints `held group=<id|none> extras=<codes|-> courses=<ids|all> end=<instant|none>` (GET .../nazirs/:userId/permissions).
//          `same` fails unless that is what `last` says (a step that must write nothing); `profile` fails unless it is the profile (and says so);
//          `nothing` fails unless the nazır holds nothing; `profile` and `nothing` and `record` then write it as `last`. A person who is
//          not a nazır any more reads `gone`, and `dismiss` records it as `last`, so that a step after the dismissal can say "nothing was written".
// dismiss  DELETE /madrasahs/:id/nazirs/:userId with no decisions (the nazır gave nobody anything); 404 is fine. It records `gone`.
// drop-group  DELETE /madrasahs/:id/permission-groups/:groupId; the nazır holds the group at most in a row the PUT has not made yet.
// clean    dismiss, then every group of the medrese named "İzin grubu nzperm", then the file. The course is `course.mjs remove nzperm`'s.
//
// Prints `permissions-data <mode> <what was done>` and nothing secret. Run it under the replay lock when walks are running and you run it by hand.
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
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HEAD = "basmuderris";
const SPARE = "applicantF";
const GROUP_NAME = "İzin grubu nzperm";
const GROUP_CODES = ["enrollment.decide", "enrollment.complete"];
const EXTRA = "week.hide";
const ZONE = "Europe/Istanbul";
const FILE = resolve(LOCAL, "nazir-permissions.json");
const MADE = resolve(LOCAL, "made", "nzperm.json");
const DAY = 86_400_000;

const madrasah = () => seed().madrasah;
const nazirPath = () => `/madrasahs/${madrasah()}/nazirs/${subOf(SPARE)}`;
const groupsPath = () => `/madrasahs/${madrasah()}/permission-groups`;

const read = () => {
  if (!existsSync(FILE))
    throw new Fail(
      `${FILE} does not exist: run \`permissions-data.mjs up\` first`
    );
  return JSON.parse(readFileSync(FILE, "utf8"));
};
const write = (data) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
};

/** `YYYY-MM-DD` of an instant on the clock of Istanbul, which has no daylight saving time any more (+03:00 all year). */
const dayOf = (at) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

function dates() {
  const now = Date.now();
  const future = `${dayOf(now + 30 * DAY)}T23:59`;
  const futureIso = new Date(`${future}:00+03:00`).toISOString();
  const past = `${dayOf(now - 30 * DAY)}T12:00`;
  const futureLabel = new Intl.DateTimeFormat("tr", {
    dateStyle: "long",
    timeZone: ZONE,
  }).format(new Date(futureIso));
  return { future, futureIso, futureLabel, past };
}

async function groupsNamed() {
  const r = await must(HEAD, "GET", groupsPath());
  return (Array.isArray(r.body) ? r.body : []).filter(
    (g) => g.name.toLowerCase() === GROUP_NAME.toLowerCase()
  );
}

async function dropGroup(id) {
  let r = await call(HEAD, "DELETE", `${groupsPath()}/${id}`, {});
  if (r.status === 400 && r.body?.code === "USERS_POLICY_REQUIRED")
    r = await call(HEAD, "DELETE", `${groupsPath()}/${id}`, {
      usersPolicy: "revoke",
    });
  if (r.status >= 300 && r.status !== 404)
    throw new Fail(
      `DELETE ${groupsPath()}/${id}: HTTP ${r.status} ${r.text.slice(0, 160)}`
    );
}

async function dismiss() {
  const r = await call(HEAD, "DELETE", nazirPath(), { decisions: [] });
  if (r.status >= 300 && r.status !== 404)
    throw new Fail(
      `DELETE ${nazirPath()}: HTTP ${r.status} ${r.text.slice(0, 160)}`
    );
  return r.status === 404 ? "none" : "dismissed";
}

/** What the API says the nazır holds, in one line; `gone` when the person is not a nazır of the medrese (404). */
async function heldNow() {
  const r = await call(HEAD, "GET", `${nazirPath()}/permissions`);
  if (r.status === 404) return "gone";
  if (r.status >= 300)
    throw new Fail(
      `GET ${nazirPath()}/permissions: HTTP ${r.status} ${r.text.slice(0, 160)}`
    );
  const b = r.body;
  const line = `held group=${b.groupId ?? "none"} extras=${b.permissions.length ? [...b.permissions].sort().join(",") : "-"} courses=${b.courseIds === null ? "all" : [...b.courseIds].sort().join(",")} end=${b.expiresAt ? new Date(b.expiresAt).toISOString() : "none"}`;
  return line;
}

run("permissions-data", async () => {
  const [mode, arg, ...rest] = process.argv.slice(2);
  if (accountKey(SPARE) !== "APPLICANT_F")
    throw new Fail("the spare account is wrong", 2);
  if (!mode)
    throw new Fail(
      "usage: permissions-data.mjs up [--holds] | held [same|profile|nothing|record] | dismiss | drop-group | clean | down",
      2
    );

  if (mode === "clean" || mode === "down") {
    const did = await dismiss();
    for (const g of await groupsNamed()) await dropGroup(g.id);
    rmSync(FILE, { force: true });
    console.log(
      `permissions-data ${mode} nazır ${did}, group and file taken away`
    );
    return;
  }

  if (mode === "dismiss") {
    const did = await dismiss();
    if (existsSync(FILE)) write({ ...read(), last: "gone" }); // what a check of "nothing was written" must now find
    console.log(`permissions-data dismiss ${did}`);
    return;
  }

  if (mode === "drop-group") {
    const data = read();
    await dropGroup(data.groupId);
    console.log("permissions-data drop-group deleted");
    return;
  }

  if (mode === "held") {
    const data = read();
    const line = await heldNow();
    const profile = `held group=${data.groupId} extras=${EXTRA} courses=${data.course} end=${data.futureIso}`;
    const nothing = "held group=none extras=- courses=all end=none";
    if (arg === undefined) {
      console.log(line);
    } else if (arg === "same") {
      if (line !== data.last)
        throw new Fail(
          `the nazır holds something else than before: now ${line}, before ${data.last}`
        );
      console.log("held same");
    } else if (arg === "profile") {
      if (line !== profile)
        throw new Fail(`not the profile: ${line}, wanted ${profile}`);
      write({ ...data, last: line });
      console.log("held profile");
    } else if (arg === "nothing") {
      if (line !== nothing) throw new Fail(`not nothing: ${line}`);
      write({ ...data, last: line });
      console.log("held nothing");
    } else if (arg === "record") {
      write({ ...data, last: line });
      console.log("held record");
    } else throw new Fail(`held ${arg}: same, profile, nothing or record`, 2);
    return;
  }

  if (mode === "up") {
    const holds = arg === "--holds" || rest.includes("--holds");
    if (!existsSync(MADE))
      throw new Fail(
        `${MADE} does not exist: run \`course.mjs make nzperm --madrasah <id>\` first`
      );
    const made = JSON.parse(readFileSync(MADE, "utf8"));
    await dismiss(); // a nazır left by a walk that died: its grants go with the seat, then the group can be deleted
    for (const g of await groupsNamed()) await dropGroup(g.id);

    const name = await nameOf(SPARE); // also makes the `users` row exist
    await must(HEAD, "POST", nazirPath(), {});
    const group = (
      await must(HEAD, "POST", groupsPath(), {
        name: GROUP_NAME,
        scope: "COURSE",
        permissions: GROUP_CODES,
      })
    ).body;
    const d = dates();
    const data = {
      madrasah: madrasah(),
      sub: subOf(SPARE),
      name,
      email: env()[`E2E_${accountKey(SPARE)}_EMAIL`],
      groupId: group.id,
      groupName: GROUP_NAME,
      course: made.course,
      courseTitle: made.title,
      ...d,
      last: "held group=none extras=- courses=all end=none",
    };
    write(data);
    if (holds) {
      await must(HEAD, "PUT", `${nazirPath()}/permissions`, {
        groupId: group.id,
        permissions: [EXTRA],
        courseIds: [made.course],
        expiresAt: d.futureIso,
      });
      write({ ...data, last: await heldNow() });
    }
    console.log(
      `permissions-data up ${name} is a nazır${holds ? " holding the profile" : " holding nothing"}, group ${GROUP_NAME}, end ${d.futureLabel}`
    );
    return;
  }

  throw new Fail(`unknown mode ${mode}`, 2);
});
