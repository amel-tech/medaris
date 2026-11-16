#!/usr/bin/env node
// The data of nizam.inactive.reassign's walks: one köşk, one medrese and one course of the walk's own, each left with no manager, so
// that Pasif kapsamlar has a row of every kind to give a manager to; and the checks that read what an assignment left. Run from
// graphs/bindings/ (the replay's working directory):
//
//   node ../nizam/inactive/reassign/scopes.mjs up         makes the köşk and the medrese (each with a manager, OTHER, who will leave)
//   node helpers/course.mjs make inreassign --hoca OTHER --weeks 1 --lessons 1     (the course, by the shared helper: see binding.yaml)
//   node ../nizam/inactive/reassign/scopes.mjs passive    takes every manager away and checks that the three are on the list
//   node ../nizam/inactive/reassign/scopes.mjs reassigned the check after an assignment: a scope is attended by the new manager
//   node ../nizam/inactive/reassign/scopes.mjs heal       gives every scope a manager behind the page's back (binding.race.yaml)
//   node ../nizam/inactive/reassign/scopes.mjs nothing    fails unless no scope of the stack has no manager (the scenario `empty`)
//   node ../nizam/inactive/reassign/scopes.mjs down       deletes the köşk and the medrese, and the file
//
// What it makes, and why each step is what it is
//   up       POST /kosks as the başnazım (kosk.controller.ts:310: the başnazım opens a köşk with at least one nazım, never himself) with
//            OTHER as its nazım, and POST /madrasahs (madrasah.controller.ts:399) with OTHER as its başmüderris. OTHER is the stack's
//            account with no role and no enrolment; it is the manager who leaves. The person who is given each scope in the walk is
//            APPLICANT_G, a spare talebe account (the list shows OTHER as "Son yönetici" and G is typed into the e-mail field).
//            Names carry the tag, so the rows are found by name: "Deneme köşkü inreassign", "Deneme medresesi inreassign".
//   passive  The köşk and the medrese are made passive the way the pages do it: GET .../deactivation-preview, then POST .../deactivate with
//            its `confirmation` (kosk-admin.controller.ts:255-290, madrasah.controller.ts:527-560), which takes the manager off the post and
//            writes "kosk.deactivate" / "madrasah.deactivate". The course (made before this, in the seed's second köşk by course.mjs, whose
//            one müderris is OTHER and the imam) has NO API that takes its last müderris off (helpers/unseat-hoca.mjs says so), so its
//            post is revoked with SQL: the one place SQL is used for the state itself. The same SQL moves each revoked post 2, 5 and 3
//            days back (köşk, medrese, course) and the three posts' creation 10 days back, so the rows read "2 gündür", "5 gündür" and
//            "3 gündür" and come in that order of age; the API writes "now", and the dates are what the e2e's own seed gives by SQL too.
//            It then reads GET /nizam/inactive-scopes as the başnazım and fails unless the three are on it.
//   heal     POST /nizam/inactive-scopes/:type/:id/assign as the başnazım for each of the three, with OTHER, so that a person's own press
//            in the open window meets INACTIVE_SCOPE_NOT_FOUND ("Bu kapsam artık pasif değil."). A scope that has a manager already is fine.
//   nothing  Reads GET /nizam/inactive-scopes as the başnazım and fails, naming what is on it, unless it is empty: the scenario `empty` makes no
//            data, so it can be walked only on a stack where no other walk left a scope without a manager, and says so instead of failing late.
//   down     DELETE /kosks/:id (the başnazım's: it takes the köşk's role assignments with it) and DELETE /madrasahs/:id for what the file and
//            the short names find, so a walk that died before its teardown leaves nothing. The course is taken away by `course.mjs remove`
//            (it deletes the course, its decks and its mails); this does not touch it.
//
// What a walk leaves and this cannot remove: audit_log rows (kosk.create, madrasah.create, kosk.deactivate, madrasah.deactivate,
// inactive_scope.assign, user.lookup, kosk.delete, madrasah.delete) and the notifications the starts send, none of which the API can
// remove. The made file is graphs/.local/made/inactive-reassign.json, which binding.yaml reads as the data source `scopes`.
//
// NOT RUN: the owner's word is that nothing writes to the stack before the walk phase. Every call is read from the controllers named
// above and from the peer helpers graphs/bindings/helpers/remove-kosk.mjs and graphs/nizam/madrasahs/passivate/passivate-data.mjs. Run it
// under the replay lock when walks are running and you run it by hand.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  call,
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  refusal,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "inactive-reassign";
const COURSE_TAG = "inreassign"; // the tag of the course helpers/course.mjs makes for this flow: "Deneme dersi inreassign"
const MADE = resolve(LOCAL, "made");
const FILE = resolve(MADE, `${TAG}.json`);
const COURSE_FILE = resolve(MADE, `${COURSE_TAG}.json`);
const NEW_MANAGER = "APPLICANT_G"; // the person the walk gives the scopes to, found by e-mail address in the window
const OLD_MANAGER = "OTHER"; // the manager who leaves
const NAMES = {
  kosk: "Deneme köşkü inreassign",
  madrasah: "Deneme medresesi inreassign",
};
const HANDLE = "deneme-inreassign"; // one short name for the köşk and one for the medrese: two namespaces
const AGES = { kosk: 2, madrasah: 5, course: 3 }; // days since the post ended
const DAY = 86_400_000;
const TYPES = { kosk: "KOSK", madrasah: "MADRASAH", course: "COURSE" };
const usage =
  "usage: scopes.mjs up | passive | reassigned | heal | nothing | down (the course is made and removed by helpers/course.mjs, tag inreassign)";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v, what) => {
  if (typeof v !== "string" || !UUID.test(v))
    throw new Fail(`${what} is not an id: ${String(v).slice(0, 40)}`);
  return v.toLowerCase();
};

function recorded() {
  if (!existsSync(FILE))
    throw new Fail(
      `nothing is recorded for ${TAG}: run \`scopes.mjs up\` first (${FILE})`
    );
  return JSON.parse(readFileSync(FILE, "utf8"));
}

function keep(made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

function courseMade() {
  if (!existsSync(COURSE_FILE))
    throw new Fail(
      `the course is not made: run \`node helpers/course.mjs make ${COURSE_TAG} --hoca ${OLD_MANAGER} --weeks 1 --lessons 1\` first`
    );
  return JSON.parse(readFileSync(COURSE_FILE, "utf8"));
}

/** A date as the page words it in its zone ("13 Kasım 2026"): the same Intl call as features/permissions/present.ts:34. */
const dayWords = (when) =>
  new Intl.DateTimeFormat("tr", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(when);

/** The datetime-local value `days` ahead at noon, as e2e inactive#6 types it (`${ISO date}T12:00`). */
const localValue = (days) =>
  `${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T12:00`;

/** Every köşk or medrese the directory finds under the short name (the başnazım's directories list passive ones too). */
async function withHandle(kind) {
  const path =
    kind === "kosk"
      ? `/kosks/directory?q=${encodeURIComponent(HANDLE)}&limit=50`
      : `/madrasahs/directory?q=${encodeURIComponent(HANDLE)}&limit=50`;
  const found = (await must("SYSTEM_ADMIN", "GET", path)).body;
  return (found.items ?? []).filter(
    (x) => (x.handle ?? "").replace(/^@/, "").toLowerCase() === HANDLE
  );
}

async function removeAll() {
  let koskN = 0;
  let madrasahN = 0;
  const ids = { kosk: new Set(), madrasah: new Set() };
  if (existsSync(FILE)) {
    const made = JSON.parse(readFileSync(FILE, "utf8"));
    if (made.kosk) ids.kosk.add(uuid(made.kosk, "kosk"));
    if (made.madrasah) ids.madrasah.add(uuid(made.madrasah, "madrasah"));
  }
  for (const x of await withHandle("kosk")) ids.kosk.add(x.id);
  for (const x of await withHandle("madrasah")) ids.madrasah.add(x.id);
  for (const id of ids.kosk) {
    const r = await call("SYSTEM_ADMIN", "DELETE", `/kosks/${id}`);
    if (r.status === 404) continue; // gone already
    if (r.status < 200 || r.status >= 300)
      throw new Fail(`DELETE /kosks/${id}: ${refusal(r)}`);
    koskN++;
  }
  for (const id of ids.madrasah) {
    const r = await call("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`);
    if (r.status === 404) continue;
    if (r.status < 200 || r.status >= 300)
      throw new Fail(`DELETE /madrasahs/${id}: ${refusal(r)}`);
    madrasahN++;
  }
  if (existsSync(FILE)) rmSync(FILE);
  return { koskN, madrasahN };
}

async function up() {
  await removeAll(); // what an earlier walk left goes first
  const old = subOf(OLD_MANAGER);
  const person = {
    sub: subOf(NEW_MANAGER),
    email: env()[`E2E_${accountKey(NEW_MANAGER)}_EMAIL`],
    name: await nameOf(NEW_MANAGER),
  };
  const made = {
    tag: TAG,
    person,
    prior: { sub: old, name: await nameOf(OLD_MANAGER) },
    chief: { name: await nameOf("SYSTEM_ADMIN") },
    koskName: NAMES.kosk,
    koskHandle: HANDLE,
    madrasahName: NAMES.madrasah,
    madrasahHandle: HANDLE,
    endFuture: localValue(90),
    endPast: "2020-01-01T12:00",
  };
  // recorded as soon as each exists: a failure below is still removable by `down`
  const kosk = await must("SYSTEM_ADMIN", "POST", "/kosks", {
    name: NAMES.kosk,
    handle: HANDLE,
    description: "Pasif kapsamlar yürüyüşünün köşkü.",
    managerUserIds: [old],
  });
  made.kosk = kosk.body.id;
  keep(made);
  const madrasah = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name: NAMES.madrasah,
    handle: HANDLE,
    description: "Pasif kapsamlar yürüyüşünün medresesi.",
    headMuderrisUserId: old,
  });
  made.madrasah = madrasah.body.id;
  keep(made);
  return `inactive-reassign up kosk=${made.kosk} madrasah=${made.madrasah}`;
}

/** The deactivation the pages make: read the preview, post its confirmation; once more if the numbers moved in between. */
async function deactivate(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const preview = (
      await must("SYSTEM_ADMIN", "GET", `${path}/deactivation-preview`)
    ).body;
    if (preview.alreadyPassive) return "already";
    const r = await call("SYSTEM_ADMIN", "POST", `${path}/deactivate`, {
      confirmation: preview.confirmation,
    });
    if (r.status >= 200 && r.status < 300) return "done";
    if (r.status === 409 && r.body?.code === "PASSIVATION_IMPACT_CHANGED")
      continue;
    throw new Fail(`POST ${path}/deactivate: ${refusal(r)}`);
  }
  throw new Fail(
    `${path}: the impact kept changing between the preview and the post`
  );
}

async function passive() {
  const made = recorded();
  const course = courseMade();
  const kosk = uuid(made.kosk, "kosk");
  const madrasah = uuid(made.madrasah, "madrasah");
  const courseId = uuid(course.course, "course");
  const chief = uuid(subOf("SYSTEM_ADMIN"), "the başnazım");

  await deactivate(`/madrasahs/${madrasah}`);
  await deactivate(`/kosks/${kosk}`);
  // no API takes a course's last müderris off the post: revoked by the başnazım's hand in SQL (revoked_by is the başnazım, as the
  // page's "removed-by" line reads it), only while it is held
  await query(
    `update role_assignments set revoked_at = now(), revoked_by = '${chief}'
      where role = 'MUDERRIS' and scope_id = '${courseId}' and revoked_at is null`
  );
  // the dates: each post ended AGES days ago, and began ten days before that
  for (const [kind, role, id] of [
    ["kosk", "KOSK_NAZIM", kosk],
    ["madrasah", "MEDRESE_BASMUDERRIS", madrasah],
    ["course", "MUDERRIS", courseId],
  ]) {
    await query(
      `update role_assignments
          set revoked_at = now() - interval '${AGES[kind]} days',
              created_at = created_at - interval '${AGES[kind] + 10} days'
        where role = '${role}' and scope_id = '${id}' and revoked_at is not null`
    );
    made[`${kind}Days`] = `${AGES[kind]} gündür`;
    made[`${kind}Since`] = dayWords(new Date(Date.now() - AGES[kind] * DAY));
  }
  made.course = courseId;
  made.courseName = course.title;
  made.courseKosk = course.kosk;
  keep(made);

  // the list is the proof: the three are on it, for the right reason
  const list = (await must("SYSTEM_ADMIN", "GET", "/nizam/inactive-scopes"))
    .body;
  const missing = Object.entries({
    KOSK: kosk,
    MADRASAH: madrasah,
    COURSE: courseId,
  })
    .filter(([type, id]) => !list.some((x) => x.type === type && x.id === id))
    .map(([type]) => type);
  if (missing.length)
    throw new Fail(
      `GET /nizam/inactive-scopes does not list the walk's ${missing.join(", ")}`
    );
  const notRemoved = list.filter(
    (x) =>
      [kosk, madrasah, courseId].includes(x.id) &&
      !(x.reason === "REMOVED" && x.lastManager?.id === made.prior.sub)
  );
  if (notRemoved.length)
    throw new Fail(
      `the walk's scopes are listed with another reason or last manager: ${notRemoved.map((x) => `${x.type} ${x.reason}`).join(", ")}`
    );
  return "inactive-reassign passive kosk madrasah course";
}

async function reassigned() {
  const made = recorded();
  const ids = {
    kosk: uuid(made.kosk, "kosk"),
    madrasah: uuid(made.madrasah, "madrasah"),
    course: uuid(made.course, "course"),
  };
  const held = (
    await query(
      `select scope_id, role, user_id, is_imam from role_assignments
        where scope_id in ('${ids.kosk}', '${ids.madrasah}', '${ids.course}')
          and revoked_at is null and (expires_at is null or expires_at > now())`
    )
  )
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const done = [];
  for (const [kind, id] of Object.entries(ids)) {
    const mine = held.filter(
      (h) => h.scope_id === id && h.user_id === made.person.sub
    );
    if (mine.length === 0) continue;
    if (mine.length > 1)
      throw new Fail(`${kind}: ${mine.length} posts held by the person`);
    if (kind === "course") {
      if (!mine[0].is_imam)
        throw new Fail("course: the new hoca is not the imam");
      const listed = (
        await query(
          `select user_id from course_muderris where course_id = '${id}' and user_id = '${made.person.sub}'`
        )
      ).trim();
      if (!listed)
        throw new Fail("course: the new hoca is not on the course's list");
    } else {
      const table = kind === "kosk" ? "kosks" : "madrasahs";
      const since = JSON.parse(
        (
          await query(`select passive_since from ${table} where id = '${id}'`)
        ).trim() || "{}"
      ).passive_since;
      if (since)
        throw new Fail(`${kind}: it still carries passive_since ${since}`);
    }
    done.push(kind);
  }
  if (done.length === 0)
    throw new Fail(
      "reassigned none: no scope of the walk is held by the new manager"
    );
  return `reassigned ok ${done.join(",")}`;
}

async function nothing() {
  const list = (await must("SYSTEM_ADMIN", "GET", "/nizam/inactive-scopes"))
    .body;
  if (list.length)
    throw new Fail(
      `the stack has ${list.length} scope(s) with no manager: ${list.map((x) => `${x.type} ${x.name}`).join("; ")}`
    );
  return "inactive-reassign nothing listed";
}

async function heal() {
  const made = recorded();
  const old = subOf(OLD_MANAGER);
  const healed = [];
  for (const [kind, id] of [
    ["kosk", made.kosk],
    ["madrasah", made.madrasah],
    ["course", made.course],
  ]) {
    const r = await call(
      "SYSTEM_ADMIN",
      "POST",
      `/nizam/inactive-scopes/${TYPES[kind]}/${uuid(id, kind)}/assign`,
      { userId: old }
    );
    if (r.status === 404) continue; // it has a manager already
    if (r.status < 200 || r.status >= 300)
      throw new Fail(`assign ${kind}: ${refusal(r)}`);
    healed.push(kind);
  }
  return `inactive-reassign healed ${healed.join(",") || "none"}`;
}

run("scopes", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (rest.length) throw new Fail(usage, 2);
  if (verb === "up") console.log(await up());
  else if (verb === "passive") console.log(await passive());
  else if (verb === "reassigned") console.log(await reassigned());
  else if (verb === "heal") console.log(await heal());
  else if (verb === "nothing") console.log(await nothing());
  else if (verb === "down") {
    const { koskN, madrasahN } = await removeAll();
    console.log(`inactive-reassign down kosk=${koskN} madrasah=${madrasahN}`);
  } else throw new Fail(usage, 2);
});
