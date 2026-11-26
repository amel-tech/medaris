// The walk data of nizam.moderation.banStudent: what a ban leaves on a spare talebe and on the people told of it, read and taken away
// again through tedrisat's HTTP API (and the one SQL delete no route offers). It is the binding's `setup`, `teardown`, `events` and
// `effects`. Run with graphs/bindings/ as the working directory: `node ../nizam/moderation/banStudent/bans.mjs <verb> ...`. Nothing
// secret is printed and no password is on a command line.
//
//   node ../nizam/moderation/banStudent/bans.mjs show   --user <ACCOUNT> --kosk <id>
//   node ../nizam/moderation/banStudent/bans.mjs up     <tag> --user <ACCOUNT> [--scope COURSE|KOSK] [--reason TEXT]
//   node ../nizam/moderation/banStudent/bans.mjs lift   --user <ACCOUNT> --kosk <id>
//   node ../nizam/moderation/banStudent/bans.mjs clear  --user <ACCOUNT> --kosk <id>
//   node ../nizam/moderation/banStudent/bans.mjs forget <tag>
//   node ../nizam/moderation/banStudent/bans.mjs notice <tag> --to <ACCOUNT>
//
// show    Prints one line for each open ban the account holds in that köşk, as the köşk's nazım (KOSK_NAZIM, the person this flow is about)
//         reads it (`GET /kosks/:id/bans?status=ACTIVE`), for an `effects` check, which matches a substring of it:
//           ban <KEY> <COURSE|KOSK> course=<courseId|-> from=<extendedFromCourseId|-> role=<bannedRole> reason=<reason>
//         and `ban <KEY> none` when there is none. `from` is the course a whole-köşk ban was placed from (bans#5).
// up      Places a ban the way the page's window does, as KOSK_NAZIM, through `POST /courses/:courseId/bans`, on the course `helpers/course.mjs
//         make <tag>` made (graphs/.local/made/<tag>.json). The binding uses it to bar the person behind the page's back, so that the window's
//         own ban finds the standing one (binding.already.yaml). Prints `banned <KEY> <scope> by KOSK_NAZIM`.
// lift    Lifts each of the account's open bans in that köşk with a reason, as the başnazım (`POST /bans/:banId/lift`; SYSTEM_ADMIN reaches
//         every tier, so a ban another kademe placed is lifted too). A ban already lifted is not an error. Prints `lifted <n>`. Run it before
//         the course is deleted, so that the talebe is no longer barred when the course is taken away.
// clear   The one SQL write here, and the only way to do it: no route deletes a ban (a ban is lifted and stays on record), and a lifted row
//         the walk made would stay in the köşk's "Kaldırılan" count and in Yasaklamalar for the walks of the köşk's other ban pages. So it
//         deletes the rows of this account in that köşk that are already lifted (an open one is never touched). Prints `cleared <n>`.
// forget  Deletes the COURSE_BAN_PLACED and KOSK_BAN_PLACED notices a ban in the course "Deneme dersi <tag>" wrote for the köşk's nazımları
//         and the Medaris nazımları. They target the köşk, so `helpers/course.mjs remove` (which clears the notices that point at the course
//         and its celses) leaves them, and no route deletes a notice: this is SQL, and it names the walk's course by its title only.
//         nizam.notifications.triage refuses a Medaris nazımı who holds a ban notice that is not its own, so a leftover would stop that walk.
//         Prints `forgot <n>`.
// notice  Counts what the notices of that course say for the account (SQL, a read): `notice <tag> <KEY> total=<n> unread=<m>`. The Medaris
//         nazımı holds one, and KOSK_NAZIM, who placed the ban, holds none (ban.service.ts:350-368: the actor is left out).
//
// ACCOUNT is a spare talebe (applicantC to applicantG; never a seeded person) for show, up, lift and clear, and any account for notice.
// What it cannot undo: the audit rows (ban.create, ban.lift, course.roster_read, user.lookup), which no route removes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  call,
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const NAZIM = "KOSK_NAZIM";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;
const usage =
  "usage: bans.mjs show|lift|clear --user <ACCOUNT> --kosk <id> | up <tag> --user <ACCOUNT> [--scope COURSE|KOSK] [--reason TEXT] | forget <tag> | notice <tag> --to <ACCOUNT>";

// a uuid is the only thing that goes into the SQL besides a tag, and only after it has been matched
const uuid = (v, what) => {
  if (!UUID.test(v ?? "")) throw new Fail(`${what} is not a uuid: ${v}`, 2);
  return v;
};

// the person a walk bars is a spare talebe, never one of the seeded people
function spare(name) {
  const key = accountKey(name);
  if (!/^APPLICANT_[A-H]$/.test(key))
    throw new Fail(
      `${key} is not a spare talebe: a walk bars one of applicantA to applicantH, never a seeded person`,
      2
    );
  return key;
}

function madeCourse(tag) {
  const file = resolve(LOCAL, "made", `${tag}.json`);
  let made;
  try {
    made = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fail(
      `${file} does not exist: make the course first (helpers/course.mjs make ${tag})`
    );
  }
  uuid(made.course, "the course in the made file");
  return made;
}

const listOf = (r) => (Array.isArray(r.body) ? r.body : (r.body?.items ?? []));

async function openBansOf(as, sub, kosk) {
  const r = await must(as, "GET", `/kosks/${kosk}/bans?status=ACTIVE`);
  return listOf(r).filter((b) => b.user?.id === sub);
}

run("bans", async () => {
  const [verb, ...args] = process.argv.slice(2);
  const wantsTag = verb === "up" || verb === "forget" || verb === "notice";
  const tag = wantsTag ? args.shift() : undefined;
  if (wantsTag && !TAG.test(tag ?? "")) throw new Fail(usage, 2);
  const o = options(args, {
    values: ["user", "kosk", "to", "scope", "reason"],
  });
  if (o.rest.length) throw new Fail(usage, 2);

  if (verb === "show" || verb === "lift" || verb === "clear") {
    if (!o.user || !o.kosk) throw new Fail(usage, 2);
    const key = spare(o.user);
    const sub = uuid(subOf(key), `the sub of ${key}`);
    const kosk = uuid(o.kosk, "--kosk");

    if (verb === "show") {
      const held = await openBansOf(NAZIM, sub, kosk);
      if (held.length === 0) console.log(`ban ${key} none`);
      for (const b of held)
        console.log(
          `ban ${key} ${b.scope} course=${b.courseId ?? "-"} from=${b.extendedFromCourseId ?? "-"} role=${b.bannedRole} reason=${b.reason}`
        );
    } else if (verb === "lift") {
      let n = 0;
      for (const b of await openBansOf("SYSTEM_ADMIN", sub, kosk)) {
        const r = await call("SYSTEM_ADMIN", "POST", `/bans/${b.id}/lift`, {
          reason: "Yürüyüş bitti, yasak kaldırılıyor.",
        });
        if (r.status >= 200 && r.status < 300) n++;
        else if (r.body?.code !== "BAN_ALREADY_LIFTED")
          throw new Fail(
            `lifting ${b.id} answered ${r.status} ${r.body?.code ?? ""}`
          );
      }
      console.log(`lifted ${n}`);
    } else {
      const out = await query(
        `delete from bans where user_id = '${sub}' and kosk_id = '${kosk}' and lifted_at is not null returning id`
      );
      console.log(`cleared ${out.split("\n").filter((l) => l.trim()).length}`);
    }
    return;
  }

  if (verb === "up") {
    if (!o.user) throw new Fail(usage, 2);
    const key = spare(o.user);
    const scope = o.scope ?? "COURSE";
    if (!["COURSE", "KOSK"].includes(scope))
      throw new Fail("--scope is COURSE or KOSK", 2);
    const made = madeCourse(tag);
    await must(NAZIM, "POST", `/courses/${made.course}/bans`, {
      userId: subOf(key),
      scope,
      reason: o.reason ?? "Başka bir nazım önce yasakladı",
    });
    console.log(`banned ${key} ${scope} by ${NAZIM}`);
    return;
  }

  if (verb === "forget") {
    const out = await query(
      `delete from notifications where type in ('COURSE_BAN_PLACED', 'KOSK_BAN_PLACED') and params->>'courseTitle' = 'Deneme dersi ${tag}' returning id`
    );
    console.log(`forgot ${out.split("\n").filter((l) => l.trim()).length}`);
    return;
  }

  if (verb === "notice") {
    if (!o.to) throw new Fail(usage, 2);
    const key = accountKey(o.to);
    const sub = uuid(subOf(key), `the sub of ${key}`);
    const out = await query(
      `select count(*) as total, count(*) filter (where read_at is null) as unread from notifications where user_id = '${sub}' and type in ('COURSE_BAN_PLACED', 'KOSK_BAN_PLACED') and params->>'courseTitle' = 'Deneme dersi ${tag}'`
    );
    const row = JSON.parse(
      out.split("\n").find((l) => l.trim().startsWith("{")) ?? "{}"
    );
    console.log(
      `notice ${tag} ${key} total=${row.total ?? 0} unread=${row.unread ?? 0}`
    );
    return;
  }

  throw new Fail(usage, 2);
});
