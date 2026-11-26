// What tedris.learn.homeworkReview needs on top of `helpers/course.mjs make` (the course itself is made and removed there), as the flow's
// setup and as one of its events:
//
//   node ../tedris/learn/homeworkReview/review-data.mjs hand <tag> <ACCOUNT>        the hoca sets homework on the first celse and the talebe hands in a note
//   node ../tedris/learn/homeworkReview/review-data.mjs file <tag>                  the course team's returned file is attached to that hand-in's review
//   node ../tedris/learn/homeworkReview/review-data.mjs send <tag> <note|none>      the hoca sends the review: `note` with the note, `none` without one
//
// The course is `course.mjs make <tag> --weeks 1 --lessons 2 --talebe <ACCOUNT>`: one week of two celses, the first tomorrow at 21:00 in
// Istanbul, the account holding a seat. Everything below is written through the API as the people who write it, except the one file row.
//
// hand  The API: PUT /lessons/{id}/assignment as the course's hoca (a FILE homework with a description), then PUT /lessons/{id}/submission as
//       the talebe (a note, so the homework is handed in), then GET /courses/{id}/submissions?lessonId= as the hoca to find the hand-in's id,
//       which is written into graphs/.local/made/<tag>.json as `submission` (a binding reads it as {made.submission}).
// file  SQL, the one thing here no route can do: a row in submission_review_files. The route that makes one (POST .../review/files) answers
//       503 STORAGE_NOT_CONFIGURED on this stack, which has no file store, so the row is written by hand with the same columns and a storage
//       key no object lives under; the download of it therefore answers 503 too, which is what the flow's `refused` scenario walks. The
//       row's id is written into the same file as `reviewFile`. Attached before the review is sent, as the app lets the team do: the talebe
//       sees none of it until `send`.
// send  The API: PUT /courses/{id}/submissions/{submissionId}/review as the hoca. Sends the review, notifies the talebe (SUBMISSION_REVIEWED,
//       a row that `course.mjs remove` clears with the course) and makes the attached files visible to them. `none` needs a file attached.
//
// A deleted course takes the hand-in, the review and the file row with it (course-purge.ts deleteLessonSubmissions); the keys it queues for
// removal from storage name no object, and the stack has no store to remove them from. Each mode is idempotent. Prints
// `review-data <mode> <what was done>`; the walk's `expect` reads that line. Nothing secret is printed.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HOCA = "muderris";
const HOMEWORK =
  "Üçüncü bâbın mâzî ve muzârî çekimlerini deftere yaz ve sonraki derse getir.";
const HAND_IN = "Çekimleri yazdım; ikinci tablodaki iki satırdan emin değilim.";
// the same words as the `note` sample of ui.yaml, so the page's paragraph is what the node says
const REVIEW_NOTE =
  "Çekimlerin doğru; ikinci tablodaki iki satırı düzelttim, ekteki dosyaya bak.";
const FILE_NAME = "duzeltilmis-odev.pdf";
const FILE_TYPE = "application/pdf";
const FILE_BYTES = 1_572_864; // "1,5 MB" on the page (formatFileSize steps of 1024)

const file = (tag) => resolve(LOCAL, "made", `${tag}.json`);
const made = (tag) => {
  try {
    return JSON.parse(readFileSync(file(tag), "utf8"));
  } catch {
    throw new Fail(`no course for the tag ${tag}: run course.mjs make first`);
  }
};
const keep = (tag, m) =>
  writeFileSync(file(tag), `${JSON.stringify(m)}\n`, { mode: 0o600 });

const need = (m, key, what) => {
  if (!m[key]) throw new Fail(`${what}: run review-data.mjs ${what} first`);
  return m[key];
};

const hand = async (tag, account) => {
  const m = made(tag);
  const lesson = m.lessons?.[0];
  if (!lesson) throw new Fail("the course needs a celse");
  await must(HOCA, "PUT", `/lessons/${lesson}/assignment`, {
    description: HOMEWORK,
    kind: "FILE",
  });
  await must(account, "PUT", `/lessons/${lesson}/submission`, {
    note: HAND_IN,
  });
  const list = await must(
    HOCA,
    "GET",
    `/courses/${m.course}/submissions?lessonId=${lesson}`
  );
  const mine = (list.body?.items ?? []).find(
    (i) => i.talebe?.id === subOf(account)
  );
  if (!mine?.id)
    throw new Fail(`${accountKey(account)} has no hand-in on the celse`);
  keep(tag, { ...m, submission: mine.id, handedBy: accountKey(account) });
  return `homework set, ${accountKey(account)} handed in ${mine.id}`;
};

const attach = async (tag) => {
  const m = made(tag);
  const submission = need(m, "submission", "hand");
  const held = await query(
    `select id from submission_review_files where submission_id = '${submission}' and file_name = '${FILE_NAME}'`
  );
  const old = /"id"\s*:\s*"([^"]+)"/.exec(held)?.[1];
  if (old) {
    keep(tag, { ...m, reviewFile: old });
    return `file ${old} already there`;
  }
  const key = `local-walk/review/${tag}/${randomUUID()}`;
  const added = await query(
    `insert into submission_review_files (submission_id, storage_key, file_name, content_type, size_bytes, uploaded_by) values ('${submission}', '${key}', '${FILE_NAME}', '${FILE_TYPE}', ${FILE_BYTES}, '${subOf(HOCA)}') returning id`
  );
  const id = /"id"\s*:\s*"([^"]+)"/.exec(added)?.[1];
  if (!id) throw new Fail("the file row was not written");
  keep(tag, { ...m, reviewFile: id });
  return `file ${id} attached, not sent`;
};

const send = async (tag, how) => {
  const m = made(tag);
  const submission = need(m, "submission", "hand");
  if (how !== "note" && how !== "none")
    throw new Fail("send takes `note` or `none`", 2);
  await must(
    HOCA,
    "PUT",
    `/courses/${m.course}/submissions/${submission}/review`,
    { note: how === "note" ? REVIEW_NOTE : null }
  );
  return `review of ${submission} sent ${how === "note" ? "with" : "without"} a note`;
};

run("review-data", async () => {
  const [mode, tag, arg, ...more] = process.argv.slice(2);
  const usage =
    "usage: review-data.mjs hand <tag> <ACCOUNT> | file <tag> | send <tag> <note|none>";
  if (!tag || more.length) throw new Fail(usage, 2);
  let done;
  if (mode === "hand" && arg) done = await hand(tag, arg);
  else if (mode === "file" && arg === undefined) done = await attach(tag);
  else if (mode === "send" && arg) done = await send(tag, arg);
  else throw new Fail(usage, 2);
  console.log(`review-data ${mode} ${done}`);
});
