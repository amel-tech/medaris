// The walk data of nazar.bans.review: seven invented people with the bans the Yasaklamalar page of "Hadis ve Siyer Medresesi" is read
// against, made and removed straight in tedrisat's database. It is the binding's `setup` and `teardown`: `node bans-data.mjs up|down`.
//
//   up   [--skip omer,hatice,mustafa,rabia,kerem,sevde,selim] [--staff]   makes the people and their bans (it removes its own rows first)
//   down                                                       removes everything `up` made, and nothing else
//
// Why SQL and not the API. A ban is placed through POST /madrasahs/:id/bans, but (1) the person must be someone, and no route makes a
// `users` row for a person who has never signed in (the e2e seed does the same, apps/nazar/e2e/people-seed.ts:194); (2) the API stamps
// every ban "now", and the page's "Yeni" badge, its "Dün" and "Bugün" words and the 24-hour rule need bans that are 2, 26 and 30
// hours old; (3) no seeded account may place a ban at the Medaris kademe locally (the stack's Medaris nazımı holds no
// `platform.ban_scoped`), and the "yalnız Medaris yönetimi kaldırabilir" row needs a ban of that tier. The people are invented and have no
// Keycloak account, so no real talebe of any other walk is ever barred: a ban on one of the stack's accounts would shut it out of the
// medrese's courses for every walk that runs while it stands.
//
// The seven (all ids are fixed and made up, so `down` finds them again after a crash):
//   omer     Ömer Yasaklı     open COURSE ban on "Bina ve İzhar Şerhi", by the başmüderris (kademe 2), 2 hours ago: "Yeni", all three actions
//   hatice   Hatice Yasaklı   open COURSE ban on "İsâgûcî ile Mantığa Giriş", by the Medaris nazımı (kademe 4), 30 hours ago: only "Medreseden de yasakla" and the note
//   mustafa  Mustafa Yasaklı  open COURSE ban on "Bina ve İzhar Şerhi", by the köşk nazımı (kademe 3), 26 hours ago: widen and ask, and the other note
//   rabia    Rabia Yasaklı    open MEDRESE-wide ban, widened from "Bina ve İzhar Şerhi", by the başmüderris, 5 hours ago, with a permanent request waiting
//   kerem    Kerem Yasaklı    a COURSE ban on "Bina ve İzhar Şerhi", lifted an hour ago by the başmüderris with a reason: a row of the Kaldırılan tab
//   sevde    Sevde Yasaklı    a medrese-wide ban widened from "İsâgûcî ile Mantığa Giriş", lifted 2 hours ago by the başmüderris: a row of the Kaldırılan tab
//   selim    Selim Yasaklı    a COURSE ban on "İsâgûcî ile Mantığa Giriş", lifted 90 minutes ago by the başmüderris: so that this course holds a ban in both tabs
// `--staff` also makes Ömer a müderris of "Bina ve İzhar Şerhi" (a role_assignments row), which is what binding.staffRow.yaml needs
// (finding ban-staff-check-gaps). The bans are written with the real accounts' ids as `banned_by` (the başmüderris, the Medaris nazımı,
// the köşk nazımı), so the page names them as it names real placers.
// Nothing secret is read or printed: the ids come from graphs/.local/seed.json and the accounts' subs, and the SQL runs through the
// shared helpers (graphs/bindings/helpers/db.mjs).
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const PEOPLE = {
  omer: {
    id: "bb0e0000-0000-4000-8000-000000000001",
    given: "Ömer",
    email: "omer.yasakli@example.test",
  },
  hatice: {
    id: "bb0e0000-0000-4000-8000-000000000002",
    given: "Hatice",
    email: "hatice.yasakli@example.test",
  },
  mustafa: {
    id: "bb0e0000-0000-4000-8000-000000000003",
    given: "Mustafa",
    email: "mustafa.yasakli@example.test",
  },
  rabia: {
    id: "bb0e0000-0000-4000-8000-000000000004",
    given: "Rabia",
    email: "rabia.yasakli@example.test",
  },
  kerem: {
    id: "bb0e0000-0000-4000-8000-000000000005",
    given: "Kerem",
    email: "kerem.yasakli@example.test",
  },
  sevde: {
    id: "bb0e0000-0000-4000-8000-000000000006",
    given: "Sevde",
    email: "sevde.yasakli@example.test",
  },
  selim: {
    id: "bb0e0000-0000-4000-8000-000000000007",
    given: "Selim",
    email: "selim.yasakli@example.test",
  },
};
const FAMILY = "Yasaklı";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const id = (s) => {
  if (!UUID.test(String(s))) throw new Fail(`${s} is not a uuid`);
  return q(s);
};

/** The statements that remove every row this helper ever makes. */
function removal() {
  const ids = Object.values(PEOPLE)
    .map((p) => id(p.id))
    .join(", ");
  return [
    `delete from ban_permanent_requests where ban_id in (select id from bans where user_id in (${ids}))`,
    `delete from bans where user_id in (${ids})`,
    `delete from role_assignments where user_id in (${ids})`,
    `delete from users where id in (${ids})`,
  ];
}

run("bans-data", async () => {
  const { rest, skip, staff } = options(process.argv.slice(2), {
    values: ["skip"],
    flags: ["staff"],
  });
  const [command, ...more] = rest;
  if (!["up", "down"].includes(command) || more.length)
    throw new Fail(
      "usage: bans-data.mjs up [--skip a,b] [--staff] | bans-data.mjs down",
      2
    );

  if (command === "down") {
    await query(`${removal().join(";\n")}`);
    console.log("removed");
    return;
  }

  const skipped = new Set((skip ?? "").split(",").filter(Boolean));
  for (const name of skipped)
    if (!(name in PEOPLE)) throw new Fail(`--skip names nobody: ${name}`, 2);
  const kept = Object.keys(PEOPLE).filter((n) => !skipped.has(n));

  const s = seed();
  const madrasah = id(s.madrasah);
  const kosk = id(s.kosk);
  const open = id(s.courses.open);
  const approval = id(s.courses.approval);
  const head = id(subOf("basmuderris"));
  const medaris = id(subOf("medarisNazim"));
  const koskNazim = id(subOf("koskNazim"));

  const who = (n) => id(PEOPLE[n].id);
  const course = (n, courseId, reason, by, role, tier, hours) =>
    `insert into bans (user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at)
       values (${who(n)}, ${kosk}, ${courseId}, 'COURSE', ${q(reason)}, ${by}, ${q(role)}, ${tier}, now() - interval '${hours} hours')`;

  const rows = {
    omer: [
      course(
        "omer",
        open,
        "Celselerde ders dışı reklam yaptı.",
        head,
        "MEDRESE_BASMUDERRIS",
        2,
        2
      ),
    ],
    hatice: [
      course(
        "hatice",
        approval,
        "Hesabını başka birine kullandırdı.",
        medaris,
        "MEDARIS_NAZIM",
        4,
        30
      ),
    ],
    mustafa: [
      course(
        "mustafa",
        open,
        "Sohbet bölümünde başkalarına hakaret etti.",
        koskNazim,
        "KOSK_NAZIM",
        3,
        26
      ),
    ],
    rabia: [
      `insert into bans (user_id, madrasah_id, scope, extended_from_course_id, reason, banned_by, banned_role, banned_tier, created_at)
         values (${who("rabia")}, ${madrasah}, 'MADRASAH', ${open}, ${q("Başka derslerde de aynı davranışı sürdürdü.")}, ${head}, 'MEDRESE_BASMUDERRIS', 2, now() - interval '5 hours')`,
      `insert into ban_permanent_requests (ban_id, reason, requested_by)
         select id, ${q("Aynı davranış üçüncü kez tekrarlandı.")}, ${head} from bans where user_id = ${who("rabia")} and lifted_at is null`,
    ],
    kerem: [
      `insert into bans (user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at, lifted_at, lifted_by, lift_reason)
         values (${who("kerem")}, ${kosk}, ${open}, 'COURSE', ${q("Eski bir yasak.")}, ${head}, 'MEDRESE_BASMUDERRIS', 2, now() - interval '3 days', now() - interval '1 hour', ${head}, ${q("Süre doldu; söz verdi.")})`,
    ],
    sevde: [
      `insert into bans (user_id, madrasah_id, scope, extended_from_course_id, reason, banned_by, banned_role, banned_tier, created_at, lifted_at, lifted_by, lift_reason)
         values (${who("sevde")}, ${madrasah}, 'MADRASAH', ${approval}, ${q("Eski bir yasak, bütün medreseye genişletilmişti.")}, ${head}, 'MEDRESE_BASMUDERRIS', 2, now() - interval '4 days', now() - interval '2 hours', ${head}, ${q("Yeniden başvurdu; söz verdi.")})`,
    ],
    selim: [
      `insert into bans (user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at, lifted_at, lifted_by, lift_reason)
         values (${who("selim")}, ${kosk}, ${approval}, 'COURSE', ${q("Ders dışı bağlantılar paylaştı.")}, ${head}, 'MEDRESE_BASMUDERRIS', 2, now() - interval '3 days', now() - interval '90 minutes', ${head}, ${q("Uyarıyı kabul etti.")})`,
    ],
  };

  const statements = [
    ...removal(),
    ...kept.map(
      (n) =>
        `insert into users (id, email, given_name, family_name) values (${who(n)}, ${q(PEOPLE[n].email)}, ${q(PEOPLE[n].given)}, ${q(FAMILY)})`
    ),
    ...kept.flatMap((n) => rows[n]),
  ];
  if (staff && kept.includes("omer"))
    statements.push(
      `insert into role_assignments (user_id, role, scope_type, scope_id, granted_by)
         values (${who("omer")}, 'MUDERRIS', 'course', ${open}, ${head})`
    );
  await query(statements.join(";\n"));

  const LIFTED = ["kerem", "sevde", "selim"];
  const lifted = kept.filter((n) => LIFTED.includes(n)).length;
  console.log(
    `ready: ${kept.length - lifted} open, ${lifted} lifted${staff && kept.includes("omer") ? ", omer teaches" : ""}`
  );
});
