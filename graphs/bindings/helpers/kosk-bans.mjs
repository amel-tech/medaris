// The walk data of nizam.moderation.decideBan: open bans on spare talebe accounts, in a köşk of the walk's own (a course made by
// helpers/course.mjs), placed through tedrisat's HTTP API, and taken away again. It is the binding's `setup`, `teardown`, `events` and
// `effects`: `node helpers/kosk-bans.mjs <command> ...` (the working directory of a binding's setup is
// graphs/bindings/). It uses the shared helpers' library (lib.mjs, db.mjs); no password is ever on a command line or printed. It never
// touches a ban of anybody but the people it is given: those are spare accounts of this flow's scenarios.
//
//   up <tag> [--low KEY,KEY] [--platform KEY,KEY] [--wide KEY,KEY]
//        <tag> is the tag of a course made by `helpers/course.mjs make <tag> --kosk <id>` (graphs/.local/made/<tag>.json). Each person
//        is first cleared of every ban of the köşk (so a crashed walk leaves nothing to be refused), then the bans are placed in the
//        order of the lists, so the last person named is the newest row and the lists show newest first:
//          --low       a course ban on the made course, placed by the müderris (tier 1, "Hoca"): every kademe above lifts it
//          --platform  a course ban placed by the başnazım (tier 4, "Medaris yönetimi"): only Medaris administration lifts it
//          --wide      a köşk ban placed by the köşk's nazım (tier 3, "Köşk nazımı"), made from the course as the roster's dialog does
//        Prints `ready: <n> open`.
//   down <tag> --people KEY,KEY
//        Removes every ban of those people in the köşk, the notifications those bans sent to the köşk's nazıms ("COURSE_BAN_PLACED",
//        "KOSK_BAN_PLACED", which point at the köşk, not the course, so `course.mjs remove` cannot clear them) and any request for a
//        permanent ban: the only SQL here. No route deletes a ban (a ban is lifted, never deleted) and a ban has no foreign key to the
//        course that `course.mjs remove` deletes. Prints `removed <n>`. Safe to run twice and with the course already gone.
//   lift <tag> --who KEY[,KEY] [--newest] [--as ACCOUNT]
//        the köşk's nazım (or ACCOUNT) lifts the people's open bans through the API: a second hand that decides first. With --newest only
//        the newest of them, which is the first row of the list, the one a press decides. Prints `lifted <KEY>`, or `already <KEY>` when
//        none is open (it may run twice in one walk).
//   drop <tag> --who ACCOUNT --code CODE
//        the başnazım takes one platform permission from a Medaris nazım of the walk's own (a spare appointed by
//        helpers/nazim.mjs up), through the API the Medaris nazımları page uses: the permission the lift needs goes
//        while the list is still on her screen (BAN_LIFT_FORBIDDEN). Idempotent: `dropped <KEY> <code>`, or `already <KEY> <code>` when she
//        does not hold it. Never the seed's own Medaris nazım.
//   state <tag> --who KEY,KEY
//        prints, for each person's bans in the köşk, one line: `ban <KEY> COURSE|KOSK open [by <ROLE>]` or
//        `ban <KEY> COURSE|KOSK lifted by <ROLE> "<reason>"`, or `ban <KEY> none`
//   check <tag> --who KEY,KEY --has "<text>" | --audit <action>
//        as `state`, and fails unless one of the lines holds the text (prints `has: <text>`), or unless the audit log holds a row of the
//        action for one of the people's bans (prints `audit: <action>`). For a binding's `effects`, which cannot compute: the scenario
//        gives the people and the text
//
// KEY is the role key of an account in graphs/.local/accounts.env (APPLICANT_C, ...). The seed's own bans (it has none) are never read or
// touched: only the named people's, in the köşk the made course sits in (or the seed's second köşk when the course is gone already).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "./db.mjs";
import {
  accountKey,
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  options,
  run,
  seed,
  subOf,
} from "./lib.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usage =
  "usage: kosk-bans.mjs up <tag> [--low KEY,..] [--platform KEY,..] [--wide KEY,..] | down <tag> --people KEY,.. | lift <tag> --who KEY,.. [--newest] [--as ACCOUNT] | drop <tag> --who ACCOUNT --code CODE | state <tag> --who KEY,.. | check <tag> --who KEY,.. (--has <text> | --audit <action>)";

const keys = (list) =>
  (list ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

/** The course the walk made, or null when it is gone (the file is removed with it). */
function made(tag) {
  try {
    const m = JSON.parse(
      readFileSync(resolve(LOCAL, "made", `${tag}.json`), "utf8")
    );
    return UUID.test(m.course ?? "") ? m : null;
  } catch {
    return null;
  }
}

const needCourse = (tag) => {
  const m = made(tag);
  if (!m)
    throw new Fail(
      `graphs/.local/made/${tag}.json does not exist: make the course first (helpers/course.mjs make ${tag} --kosk <id>)`
    );
  return m;
};

/** The köşk the walk's bans sit in: the made course's, else the seed's second köşk, where every scenario makes its course. */
const koskOf = (tag) => {
  const id = made(tag)?.kosk ?? seed().kosk2;
  if (!UUID.test(id ?? "")) throw new Fail("seed.json holds no second köşk");
  return id;
};

const sub = (key) => {
  const id = subOf(key);
  if (!UUID.test(id)) throw new Fail(`${key} has no usable id`);
  return id;
};

/** Every ban of the person in the köşk: its own (course and köşk scope), and those of a course that no longer exists. */
const banWhere = (who, kosk) =>
  `user_id = '${sub(who)}' and (kosk_id = '${kosk}' or course_id in (select id from courses where kosk_id = '${kosk}') or (course_id is not null and not exists (select 1 from courses where courses.id = bans.course_id)))`;

const rows = (out) =>
  out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));

async function clear(people, kosk) {
  let removed = 0;
  for (const who of people) {
    await query(
      `delete from ban_permanent_requests where ban_id in (select id from bans where ${banWhere(who, kosk)})`
    );
    const out = await query(
      `delete from bans where ${banWhere(who, kosk)} returning id`
    );
    removed += rows(out).length;
  }
  return removed;
}

/** The ids of the people's open bans in the köşk, newest first, each with the person it is on. */
async function openBansOf(people, kosk) {
  const found = [];
  for (const who of people) {
    const out = await query(
      `select id, created_at from bans where ${banWhere(who, kosk)} and lifted_at is null`
    );
    for (const r of rows(out)) found.push({ who, ...r });
  }
  return found.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** The role key of an account by its sub, for "lifted by KOSK_NAZIM"; the first eight characters of the sub when no account has it. */
const keyOfSub = (id) => {
  if (!id) return null;
  for (const [k, v] of Object.entries(env())) {
    const m = /^E2E_(.+)_SUB$/.exec(k);
    if (m && v === id) return m[1] === "SISTEM_ADMIN" ? "SYSTEM_ADMIN" : m[1];
  }
  return id.slice(0, 8);
};

async function lines(people, kosk) {
  const out = [];
  for (const key of people) {
    const found = rows(
      await query(
        `select scope, banned_by, lifted_by, lift_reason, (lifted_at is not null) as lifted from bans where ${banWhere(key, kosk)} order by created_at`
      )
    );
    if (!found.length) out.push(`ban ${accountKey(key)} none`);
    for (const r of found)
      out.push(
        r.lifted
          ? `ban ${accountKey(key)} ${r.scope} lifted by ${keyOfSub(r.lifted_by)} "${r.lift_reason}"`
          : `ban ${accountKey(key)} ${r.scope} open by ${keyOfSub(r.banned_by)}`
      );
  }
  return out;
}

const reason = (kind) =>
  ({
    low: "Celselerde ders dışı reklam yaptı",
    platform: "Hesabını başka birine kullandırdı",
    wide: "Köşkün her yerinde sorun çıkardı",
  })[kind];

run("bans", async () => {
  const [command, tag, ...rest] = process.argv.slice(2);
  if (!command || !tag || !/^[A-Za-z0-9]+$/.test(tag)) throw new Fail(usage, 2);
  const o = options(rest, {
    values: [
      "low",
      "platform",
      "wide",
      "people",
      "who",
      "has",
      "audit",
      "as",
      "code",
    ],
    flags: ["newest"],
  });
  if (o.rest.length) throw new Fail(usage, 2);

  if (command === "up") {
    const m = needCourse(tag);
    const low = keys(o.low);
    const platform = keys(o.platform);
    const wide = keys(o.wide);
    const everyone = [...low, ...platform, ...wide];
    if (!everyone.length) throw new Fail(usage, 2);
    await clear(everyone, m.kosk);
    for (const who of everyone) await nameOf(who); // makes the person's users row, so the lists can name them
    const place = (placer, body) =>
      must(placer, "POST", `/courses/${m.course}/bans`, body);
    for (const who of low)
      await place("MUDERRIS", {
        userId: sub(who),
        scope: "COURSE",
        reason: reason("low"),
      });
    for (const who of platform)
      await place("SYSTEM_ADMIN", {
        userId: sub(who),
        scope: "COURSE",
        reason: reason("platform"),
      });
    for (const who of wide)
      await place("KOSK_NAZIM", {
        userId: sub(who),
        scope: "KOSK",
        reason: reason("wide"),
      });
    console.log(`ready: ${everyone.length} open`);
    return;
  }

  if (command === "down") {
    const people = keys(o.people);
    if (!people.length) throw new Fail(usage, 2);
    const kosk = koskOf(tag);
    const removed = await clear(people, kosk);
    // the notices of the bans: they point at the köşk and name the walk's course by its title
    await query(
      `delete from notifications where type in ('COURSE_BAN_PLACED', 'KOSK_BAN_PLACED') and target_id = '${kosk}' and params->>'courseTitle' = 'Deneme dersi ${tag}'`
    );
    console.log(`removed ${removed}`);
    return;
  }

  if (command === "lift") {
    const who = keys(o.who);
    if (!who.length) throw new Fail(usage, 2);
    let open = await openBansOf(who, koskOf(tag));
    if (o.newest) open = open.slice(0, 1);
    if (!open.length) {
      console.log(`already ${who.map(accountKey).join(",")}`);
      return;
    }
    for (const ban of open) {
      await must(o.as ?? "KOSK_NAZIM", "POST", `/bans/${ban.id}/lift`, {
        reason: "Başka bir nazım önce kaldırdı",
      });
      console.log(`lifted ${accountKey(ban.who)}`);
    }
    return;
  }

  if (command === "drop") {
    const [account, ...more] = keys(o.who);
    if (!account || more.length || !o.code) throw new Fail(usage, 2);
    if (accountKey(account) === "MEDARIS_NAZIM")
      throw new Fail(
        "the seed's own Medaris nazımı is never changed by a walk",
        2
      );
    const id = sub(account);
    const held = (await must("SYSTEM_ADMIN", "GET", "/nizam/medaris-nazims"))
      .body;
    const row = (held ?? []).find((r) => r.user?.id === id);
    const codes = (row?.permissions ?? []).map((p) => p.code);
    if (!row || !codes.includes(o.code)) {
      console.log(`already ${accountKey(account)} ${o.code}`);
      return;
    }
    // a PUT replaces the group and the single permissions together: the group, if any, is sent back as it is
    const group = (row.groups ?? []).find((g) => g.scope === "PLATFORM")?.id;
    await must("SYSTEM_ADMIN", "PUT", `/nizam/medaris-nazims/${id}/grants`, {
      ...(group ? { groupId: group } : {}),
      permissions: codes.filter((c) => c !== o.code),
    });
    console.log(`dropped ${accountKey(account)} ${o.code}`);
    return;
  }

  if (command === "state" || command === "check") {
    const who = keys(o.who);
    if (!who.length) throw new Fail(usage, 2);
    const kosk = koskOf(tag);
    if (command === "state") {
      for (const l of await lines(who, kosk)) console.log(l);
      return;
    }
    if (o.audit) {
      const ids = who.map((k) => `'${sub(k)}'`).join(", ");
      const out = rows(
        await query(
          `select count(*)::int as n from audit_log where action = '${o.audit.replace(/[^a-z.]/g, "")}' and details->>'userId' in (${ids})`
        )
      );
      if (!out[0]?.n)
        throw new Fail(`no audit row ${o.audit} for ${who.join(", ")}`);
      console.log(`audit: ${o.audit}`);
      return;
    }
    if (!o.has) throw new Fail(usage, 2);
    const all = await lines(who, kosk);
    if (!all.some((l) => l.includes(o.has)))
      throw new Fail(`no ban line holds "${o.has}": ${all.join(" | ")}`);
    console.log(`has: ${o.has}`);
    return;
  }

  throw new Fail(usage, 2);
});
