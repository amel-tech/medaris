// The walk data of nazar.bans.ban: what a ban leaves on a spare talebe, read and taken away again through tedrisat's HTTP API
// as the başmüderris of the seed's medrese. It is the binding's `setup`, `teardown` and `effects`; the course and the talebe's seat
// are helpers/course.mjs's.
//
//   node ../nazar/bans/ban/bans.mjs show  --user <ACCOUNT> --madrasah <id>
//   node ../nazar/bans/ban/bans.mjs lift  --user <ACCOUNT> --madrasah <id>
//   node ../nazar/bans/ban/bans.mjs clear --user <ACCOUNT> --madrasah <id>
//
// show   Prints one line for each open ban the account holds in that medrese (from `GET /madrasahs/:id/bans?status=ACTIVE`), as the
//        başmüderris sees it:  `ban <KEY> <COURSE|MADRASAH> course=<courseId|-> role=<bannedRole> reason=<reason>`, and
//        `ban <KEY> none` when there is none. An `effects` check matches a substring of it.
// lift   Lifts each of those bans with a reason (`POST /bans/:banId/lift`, the başmüderris placed them, so she may) and prints
//        `lifted <n>`. A ban already lifted is not an error. Run it before the course is deleted, so that the talebe is no longer
//        barred when the course is taken away.
// clear  The one SQL write here, and the only way to do it: no route deletes a ban, a ban is lifted and stays on record, and a lifted
//        row the walk made would stay in the medrese's "Kaldırılan" tab and in its count, which the walks of the medrese's other
//        ban pages read. So it deletes the rows of this account that the başmüderris placed and that are already lifted (an open
//        one is never touched) and prints `cleared <n>`. The audit rows (ban.create) stay: no route removes them either.
//
// ACCOUNT is a spare talebe (applicantE); never a seeded person. Nothing secret is printed.
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  call,
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HEAD = "MEDRESE_BASMUDERRIS";
const usage =
  "usage: bans.mjs show|lift|clear --user <ACCOUNT> --madrasah <id>";

// a uuid is the only thing that goes into the SQL, and only after it has been matched
const uuid = (v, what) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v ?? ""
    )
  )
    throw new Fail(`${what} is not a uuid: ${v}`, 2);
  return v;
};

async function openBansOf(sub, madrasah) {
  const r = await must(
    HEAD,
    "GET",
    `/madrasahs/${madrasah}/bans?status=ACTIVE`
  );
  const items = Array.isArray(r.body) ? r.body : (r.body?.items ?? []);
  return items.filter((b) => b.user?.id === sub);
}

run("bans", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  const o = options(rest, { values: ["user", "madrasah"] });
  if (
    !["show", "lift", "clear"].includes(verb) ||
    !o.user ||
    !o.madrasah ||
    o.rest.length
  )
    throw new Fail(usage, 2);
  const key = accountKey(o.user);
  if (
    key === HEAD ||
    [
      "SYSTEM_ADMIN",
      "MEDARIS_NAZIM",
      "KOSK_NAZIM",
      "MUDERRIS",
      "TALEBE",
      "TALEBE_MALE",
    ].includes(key)
  )
    throw new Fail(
      `${key} is a seeded person: a walk bars a spare talebe only`,
      2
    );
  const sub = uuid(subOf(key), `the sub of ${key}`);
  const madrasah = uuid(o.madrasah, "--madrasah");

  if (verb === "show") {
    const held = await openBansOf(sub, madrasah);
    if (held.length === 0) console.log(`ban ${key} none`);
    for (const b of held)
      console.log(
        `ban ${key} ${b.scope} course=${b.courseId ?? "-"} role=${b.bannedRole} reason=${b.reason}`
      );
  } else if (verb === "lift") {
    let n = 0;
    for (const b of await openBansOf(sub, madrasah)) {
      const r = await call(HEAD, "POST", `/bans/${b.id}/lift`, {
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
    const head = uuid(subOf(HEAD), `the sub of ${HEAD}`);
    const out = await query(
      `delete from bans where user_id = '${sub}' and banned_by = '${head}' and lifted_at is not null returning id`
    );
    console.log(`cleared ${out.split("\n").filter((l) => l.trim()).length}`);
  }
});
