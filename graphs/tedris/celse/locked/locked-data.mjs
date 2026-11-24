// What tedris.celse.locked needs on top of `helpers/course.mjs make` (the course itself is made and removed there), as the flow's setup:
//
//   node ../tedris/celse/locked/locked-data.mjs content <tag>                    gives the course the content the lock hides, and a sample celse
//   node ../tedris/celse/locked/locked-data.mjs revoke <tag> <ACCOUNT>           the account holds a REVOKED seat in the course
//   node ../tedris/celse/locked/locked-data.mjs seat <tag> <ACCOUNT>             what the account holds in the course: `seat <KEY> <course> <status>`
//
// The course is `course.mjs make <tag> --approval --weeks 1 --lessons 3`: one week of three celses, tomorrow, the day after and in five
// days at 21:00 in Istanbul, titled "Celse 1" to "Celse 3", so every row of the programme is in the one week that the locked page opens.
//
// content  The API (PATCH /lessons/{id} as the course's hoca): the first celse gets a meeting link, a source and an agenda (the things a
//          locked reader must not find in the page), the third is made the sample celse (isPreview, with its own source and agenda), which
//          is the one row of the programme a person with no seat can follow (CLS-11: it points at an anchor the celse page does not have).
//          The course's version moves on with every write, so it is read again between the two.
// revoke   The API: the account applies (the course asks for approval, so PENDING), the hoca approves, the hoca takes the seat away with a
//          reason (POST /courses/{id}/enrollments/{userId}/remove). The row stays as REVOKED, which is what the page's reason `revoked`
//          reads. Removing sends the talebe a notification and, through the invitation sweep, mail: the binding's teardown clears both.
//          `course.mjs remove <tag>` deletes the course and with it the row.
// Nothing is written to SQL. Each mode is idempotent. Prints `locked-data <mode> <what was done>`. Nothing secret is printed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HOCA = "muderris";
const MEETING = "https://meet.example.test/kilitli-celse";
const SOURCE = "Bina, ilk fasıl";
const AGENDA = [{ time: "21:00", title: "Sîgaların tekrarı" }];
const SAMPLE_SOURCE = "Bina, ikinci fasıl";
const SAMPLE_AGENDA = [{ time: "21:00", title: "Örnek celse okuması" }];

const made = (tag) => {
  try {
    return JSON.parse(
      readFileSync(resolve(LOCAL, "made", `${tag}.json`), "utf8")
    );
  } catch {
    throw new Fail(`no course for the tag ${tag}: run course.mjs make first`);
  }
};

// what the course holds for the account, REVOKED rows included (helpers/seat.mjs leaves them out): ENROLLED, PENDING, REVOKED... or none
const seatOf = async (account, course) => {
  const r = await must(
    account,
    "GET",
    "/courses/enrolled?includePending=true&includeRevoked=true"
  );
  const list = Array.isArray(r.body) ? r.body : (r.body?.items ?? []);
  return list.find((c) => c.id === course)?.enrollment?.status ?? "none";
};

const read = async (course) =>
  (await must(HOCA, "GET", `/courses/${course}`)).body;

const content = async (tag) => {
  const m = made(tag);
  const [first, , third] = m.lessons;
  if (!first || !third) throw new Fail("the course needs three celses");
  let c = await read(m.course);
  await must(HOCA, "PATCH", `/lessons/${first}`, {
    version: c.version,
    meetingUrl: MEETING,
    kaynak: SOURCE,
    agenda: AGENDA,
  });
  c = await read(m.course);
  await must(HOCA, "PATCH", `/lessons/${third}`, {
    version: c.version,
    isPreview: true,
    kaynak: SAMPLE_SOURCE,
    agenda: SAMPLE_AGENDA,
  });
  return "first celse with a link, a source and an agenda; third celse is the sample";
};

const revoke = async (tag, account) => {
  const m = made(tag);
  const key = accountKey(account);
  const held = await seatOf(account, m.course);
  if (held === "REVOKED") return `${key} already REVOKED`;
  if (held === "none")
    await must(account, "POST", `/courses/${m.course}/enroll`);
  const now = await seatOf(account, m.course);
  if (now === "PENDING")
    await must(
      HOCA,
      "POST",
      `/courses/${m.course}/enrollments/${subOf(account)}/approve`
    );
  await must(
    HOCA,
    "POST",
    `/courses/${m.course}/enrollments/${subOf(account)}/remove`,
    { reason: "Deneme: kaydı geri alındı." }
  );
  return `${key} applied, approved and removed: REVOKED`;
};

const seat = async (tag, account) => {
  const m = made(tag);
  return `seat ${accountKey(account)} ${m.course} ${await seatOf(account, m.course)}`;
};

run("locked-data", async () => {
  const [mode, tag, account, ...more] = process.argv.slice(2);
  const usage =
    "usage: locked-data.mjs content <tag> | revoke <tag> <ACCOUNT> | seat <tag> <ACCOUNT>";
  if (!tag || more.length) throw new Fail(usage, 2);
  let done;
  if (mode === "content" && account === undefined) done = await content(tag);
  else if (mode === "revoke" && account) done = await revoke(tag, account);
  else if (mode === "seat" && account) done = await seat(tag, account);
  else throw new Fail(usage, 2);
  console.log(mode === "seat" ? done : `locked-data ${mode} ${done}`);
});
