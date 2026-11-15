// A course of a walk's own, made through the API and taken away again by its tag: the shared form of what writers kept copying
// (recordings-data.mjs, programme-data.mjs, draft-course.mjs). The seeded courses are other flows' data; a walk that changes one
// or adds to it should make its own.
//
//   node helpers/course.mjs make <tag> [--kosk <id> | --madrasah <id>] [--draft] [--approval] [--weeks <n>] [--lessons <n>]
//                                      [--start <days>] [--hoca <ACCOUNT>] [--talebe <ACCOUNT>...]
//   node helpers/course.mjs remove <tag>
//
// make   Opens a course titled `Deneme dersi <tag>` and prints, on one line, {"tag","title","course","kosk","madrasah","weeks":[ids],
//        "lessons":[ids, in programme order],"talebe":{"KEY":"ENROLLED|PENDING"}}; the same is written to graphs/.local/made/<tag>.json,
//        which a binding reads as a data source (`data: { made: { json: ../.local/made/<tag>.json } }`, then `{made.course}`).
//        Making a tag again removes the old one first.
//   --kosk       the köşk the course is opened in (default: the seed's second köşk, `seed.kosk2`, which no seeded flow reads).
//                The köşk's nazım opens it in the two seeded köşks, the başnazım in any other.
//   --madrasah   a course of that medrese, opened by the başnazım, in --kosk or else the seed's first köşk (which hosts the seeded medrese).
//   --draft      a DRAFT course (default: PUBLISHED).   --approval   every application waits for approval (default: anyone takes a seat).
//   --weeks / --lessons   how many weeks (default 2) and how many LIVE celses of 60 minutes in each (default 2), titled "Hafta n" and
//                "Celse n", a celse every 2 days within a week and a week every 7 days, the first one `--start` days from now (default 1;
//                a negative number starts in the past), at 21:00 in Istanbul.
//   --hoca       the course's one müderris, who is also the imam (default MUDERRIS). The köşk's nazım cannot name themselves.
//   --talebe     accounts that apply to the course after it is made, so they hold ENROLLED, or PENDING with --approval (several accounts
//                follow one --talebe, or repeat it, or separate them with commas).
// remove Deletes the course, as the başnazım alone may, and everything under it, its decks included; the talebe leave first, and the invitation mails the
//        course sent them (subject `<title> — Celse n`) are cleared from Mailpit. Safe to run twice: a tag with nothing recorded is `none`.
//
// Only the API is used, besides Mailpit's and the deletes of the course's decks and notifications. Run it under the replay lock when walks are running and you run it by hand.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "./db.mjs";
import {
  accountKey,
  call,
  Fail,
  LOCAL,
  MAILPIT,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "./lib.mjs";

const MADE = resolve(LOCAL, "made");
const DAY = 86_400_000;
const usage =
  "usage: course.mjs make <tag> [--kosk <id> | --madrasah <id>] [--draft] [--approval] [--weeks <n>] [--lessons <n>] [--start <days>] [--hoca <ACCOUNT>] [--talebe <ACCOUNT>...] | remove <tag>";

const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const titleOf = (tag) => `Deneme dersi ${tag}`;

// the instant `days` from now at 18:00 UTC (21:00 in Istanbul), the hour the seed's own celses have
const at = (days) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
};

function parse(args) {
  const o = { talebe: [] };
  const numbers = ["weeks", "lessons", "start"];
  const values = ["kosk", "madrasah", "hoca"];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) throw new Fail(`unexpected ${a}`, 2);
    const name = a.slice(2);
    if (name === "draft" || name === "approval") o[name] = true;
    else if (name === "talebe") {
      while (i + 1 < args.length && !args[i + 1].startsWith("--"))
        o.talebe.push(...args[++i].split(",").filter(Boolean));
      if (!o.talebe.length)
        throw new Fail("--talebe needs at least one ACCOUNT", 2);
    } else if (values.includes(name) || numbers.includes(name)) {
      if (i + 1 >= args.length) throw new Fail(`--${name} needs a value`, 2);
      const v = args[++i];
      if (numbers.includes(name)) {
        if (!/^-?\d+$/.test(v))
          throw new Fail(`--${name} is a whole number, not ${v}`, 2);
        o[name] = Number(v);
      } else o[name] = v;
    } else throw new Fail(`unknown option ${a}`, 2);
  }
  return o;
}

async function mailCount(query) {
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}&limit=1`,
    { signal: AbortSignal.timeout(30_000) }
  );
  if (!res.ok) throw new Fail(`Mailpit answered ${res.status}`);
  return (await res.json()).messages_count ?? 0;
}

// the mails the course sent: the invitation sweep runs a moment after a write, so wait until the count has stopped changing
async function clearMail(title, wait) {
  // `<title> — Celse`: a tag that is the start of another (proof, proof2) must not clear the other's mails
  const query = `subject:"${title} — Celse"`;
  let last = -1;
  let steady = 0;
  for (let i = 0; i < (wait ? 12 : 1); i++) {
    const n = await mailCount(query);
    steady = n === last ? steady + 1 : 0;
    last = n;
    if (!wait || steady >= 2) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (last > 0) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`,
      { method: "DELETE", signal: AbortSignal.timeout(30_000) }
    );
    if (!res.ok) throw new Fail(`Mailpit answered ${res.status} to the delete`);
  }
  return Math.max(last, 0);
}

async function remove(tag) {
  const file = fileOf(tag);
  if (!existsSync(file)) return `none`;
  const made = JSON.parse(readFileSync(file, "utf8"));
  for (const who of Object.keys(made.talebe ?? {}))
    await call(who, "DELETE", `/courses/${made.course}/enrollment`); // a talebe already gone is fine
  // decks.course_id is `on delete set null`: deleting the course would keep its decks as private decks of their author.
  // Their cards, labels and users go with them (cascade); a proposal's deck_id is set null.
  if (made.course)
    await query(`delete from decks where course_id = '${made.course}'`);
  if (made.course)
    await must(
      "SYSTEM_ADMIN",
      "DELETE",
      `/courses/${made.course}`,
      undefined,
      [404]
    );
  // notifications about the course or its celses (an approval, a cancelled celse) point at nothing now, and no route deletes one
  if (made.course) {
    const targets = [made.course, ...(made.lessons ?? [])]
      .map((x) => `'${x}'`)
      .join(", ");
    await query(`delete from notifications where target_id in (${targets})`);
  }
  const mails = await clearMail(
    made.title,
    Object.keys(made.talebe ?? {}).length > 0
  );
  rmSync(file);
  return `${made.course} removed, ${mails} mail(s) cleared`;
}

async function make(tag, o) {
  await remove(tag); // a tag made before goes first
  const nWeeks = o.weeks ?? 2;
  const nLessons = o.lessons ?? 2;
  const start = o.start ?? 1;
  if (nWeeks < 0 || nLessons < 0)
    throw new Fail("--weeks and --lessons are not negative", 2);
  const hoca = o.hoca ?? "MUDERRIS";
  const hocaUser = { userId: subOf(hoca), name: await nameOf(hoca) };
  const title = titleOf(tag);
  const weeks = Array.from({ length: nWeeks }, (_, w) => ({
    weekNumber: w + 1,
    title: `Hafta ${w + 1}`,
    lessons: Array.from({ length: nLessons }, (_, j) => ({
      title: `Celse ${w * nLessons + j + 1}`,
      type: "LIVE",
      durationMinutes: 60,
      scheduledAt: at(start + 7 * w + 2 * j),
    })),
  }));
  const fields = {
    title,
    description: `Bir yürüyüşün kendi dersi: ${tag}.`,
    durationWeeks: nWeeks,
    status: o.draft ? "DRAFT" : "PUBLISHED",
    requiresApproval: o.approval === true,
  };

  let koskId = o.kosk;
  let id;
  if (o.madrasah) {
    koskId ??= seed().kosk;
    const opened = await must(
      "SYSTEM_ADMIN",
      "POST",
      `/madrasahs/${o.madrasah}/courses`,
      {
        koskId,
        title,
        muderrisUserIds: [hocaUser.userId],
        imamUserId: hocaUser.userId,
        requiresApproval: fields.requiresApproval,
      }
    );
    id = opened.body.id;
    keep(tag, {
      tag,
      title,
      course: id,
      kosk: koskId,
      madrasah: o.madrasah,
      weeks: [],
      lessons: [],
      talebe: {},
    }); // recorded at once: a failure below is still removable
    // a medrese's course is opened as a draft without a programme: the whole-course save gives it both
    const version = (await must("SYSTEM_ADMIN", "GET", `/courses/${id}`)).body
      .version;
    await must("SYSTEM_ADMIN", "PUT", `/courses/${id}`, {
      ...fields,
      version,
      weeks,
    });
  } else {
    koskId ??= seed().kosk2;
    const own =
      koskId === seed().kosk || koskId === seed().kosk2
        ? "KOSK_NAZIM"
        : "SYSTEM_ADMIN";
    if (accountKey(hoca) === own)
      throw new Fail(
        `${accountKey(hoca)} opens the course and cannot also be its hoca`,
        2
      );
    const created = await must(own, "POST", `/kosks/${koskId}/courses`, {
      ...fields,
      muderris: [hocaUser],
      imamUserId: hocaUser.userId,
      weeks,
    });
    id = created.body.id;
    keep(tag, {
      tag,
      title,
      course: id,
      kosk: koskId,
      weeks: [],
      lessons: [],
      talebe: {},
    });
  }

  const course = (await must("SYSTEM_ADMIN", "GET", `/courses/${id}`)).body;
  const made = {
    tag,
    title,
    course: id,
    kosk: koskId,
    ...(o.madrasah ? { madrasah: o.madrasah } : {}),
    weeks: course.weeks.map((w) => w.id),
    lessons: course.weeks.flatMap((w) => w.lessons.map((l) => l.id)),
    talebe: {},
  };
  keep(tag, made);
  for (const who of o.talebe) {
    const r = await must(who, "POST", `/courses/${id}/enroll`);
    made.talebe[accountKey(who)] = r.body?.status ?? "ok";
    keep(tag, made);
  }
  return made;
}

function keep(tag, made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

run("course", async () => {
  const [verb, tag, ...rest] = process.argv.slice(2);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(tag ?? ""))
    throw new Fail(
      `a tag is letters, digits, - and _ (at most 41): ${usage}`,
      2
    );
  if (verb === "make") {
    const made = await make(tag, parse(rest));
    console.log(JSON.stringify(made));
  } else if (verb === "remove") {
    if (rest.length) throw new Fail(usage, 2);
    console.log(`course remove ${tag} ${await remove(tag)}`);
  } else throw new Fail(usage, 2);
});
