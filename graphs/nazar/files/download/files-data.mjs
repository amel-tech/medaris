// What nazar.files.download needs on top of `helpers/course.mjs make nazarfiles` (the course itself is made and removed there), as the
// flow's setup and teardown:
//
//   node ../nazar/files/download/files-data.mjs up <mode>   the made course gets what the page of that mode reads (below); writes
//                                                           graphs/.local/nazar-files-download.json (ids only)
//   node ../nazar/files/download/files-data.mjs down        the rows this helper wrote are taken away, and the stale deletions the
//                                                           course purge could queue for them; run it BEFORE `course.mjs remove nazarfiles`
//
// The made course: `course.mjs make nazarfiles --kosk <kosk2> --weeks 1 --lessons 1 --hoca MUDERRIS --talebe applicantF`, one week of one
// celse tomorrow at 21:00 in Istanbul; applicantF ("Tahsin Başvuran", a man) holds a seat. Nothing seeded is touched, and no other account is.
// ONE celse on purpose: every page of the flow then has one section, one table row and one toggle, so no node of the ui is a `repeat`.
//
//   <mode>        the page          what `up` adds to the made course
//   homework      /odevler          the müderris sets the homework (PUT /lessons/<celse>/assignment, kind FILE, as MUDERRIS, the API) and
//                                   applicantF hands in (PUT /lessons/<celse>/submission, a note of null makes the row, the API); the one
//                                   file of the hand-in, "teslim-odevi.pdf" (PDF, 20 kB), is a SQL row in `submission_files`
//   curriculum    /mufredat         the same homework, with one file "odev-kagidi.pdf" (PDF, 36 kB) in `lesson_assignment_files`; one file
//                                   "celse-notlari.pdf" (PDF, 24 kB) among the celse's resources (`lesson_resources`) and one,
//                                   "kaynak-listesi.pdf" (PDF, 12 kB), among the course's (`course_resources`)
//   evaluation    /degerlendirme    the müderris sets the homework with kind MEMORIZE (recited, marked on Değerlendirme), so the board has a
//                                   column; the talebe is already enrolled, so it has a row. Without a column or a talebe the page draws an
//                                   empty state and no "Excel indir" link
//
// WHAT IS WRITTEN BY SQL, AND WHY. Only the file rows. The one way a file gets into any of the four places is its upload route, which answers
// 503 STORAGE_NOT_CONFIGURED here (the stack has no Bunny Storage), and a course's resources are written only by the whole-course PUT, which
// would replace the whole programme. So the rows go into `course_resources`, `lesson_resources`, `lesson_assignment_files` and
// `submission_files` under storage keys that start with `graphs-nazar-files/`, which no object backs (the CHECK constraints of
// course_resources and lesson_resources want a file row to carry the four file columns and no url). Nothing reads the object except a
// download, and a download on this stack stops at the refusal storage gives: tedrisat asks the store whether it is configured before it looks
// at anything else, so it answers 503 STORAGE_NOT_CONFIGURED and the staff's read of a hand-in is not written to the audit log either (that row
// is made after the check, before the first byte). `down` deletes our file rows (and any `storage_deletions` row with that prefix, which the
// course's purge queues for them); the course is deleted afterwards by `course.mjs remove nazarfiles`, which finds nothing of ours left.
//
// Run by hand, it changes data: run it under the replay lock, as a replay does. Both commands are idempotent. Prints `files-data <mode>
// <what was done>`; nothing secret is printed.
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

const TALEBE = "applicantF";
const HOCA = "muderris";
const TAG = "nazarfiles";
const PREFIX = "graphs-nazar-files";
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const JSON_FILE = resolve(LOCAL, "nazar-files-download.json");
const MODES = ["homework", "curriculum", "evaluation"];

// the words of ui.yaml `samples`: keep them the same
const FILES = {
  submission: { name: "teslim-odevi.pdf", bytes: 20480 },
  courseResource: { name: "kaynak-listesi.pdf", bytes: 12288 },
  lessonResource: { name: "celse-notlari.pdf", bytes: 24576 },
  assignment: { name: "odev-kagidi.pdf", bytes: 36864 },
};
const HOMEWORK = "Üçüncü bâbın çekimlerini deftere yaz ve sonraki derse getir.";
const PDF = "application/pdf";

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

const made = () => {
  if (!existsSync(MADE))
    throw new Fail(
      `no course for the tag ${TAG}: run helpers/course.mjs make ${TAG} first`
    );
  return JSON.parse(readFileSync(MADE, "utf8"));
};
const read = () =>
  existsSync(JSON_FILE) ? JSON.parse(readFileSync(JSON_FILE, "utf8")) : {};
const write = (data) => {
  writeFileSync(JSON_FILE, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(JSON_FILE, 0o600);
};

// a statement that writes: it must have changed the rows we expect
async function put(sql, rows) {
  const out = (await query(sql)).trim();
  if (out !== `{"rows":${rows}}`)
    throw new Fail(`expected ${rows} row(s) written, got: ${out}`);
}

// what an earlier run left: the file rows of this course, and the deletions queued for the fake keys
async function clean(m) {
  const lessons = (m.lessons ?? []).map(q).join(", ");
  await query(
    `${
      lessons
        ? `delete from submission_files where submission_id in (select id from lesson_submissions where lesson_id in (${lessons}));
     delete from lesson_assignment_files where assignment_id in (select id from lesson_assignments where lesson_id in (${lessons}));
     delete from lesson_resources where lesson_id in (${lessons});`
        : ""
    }
     delete from course_resources where course_id = ${q(m.course)};
     delete from storage_deletions where storage_key like ${q(`${PREFIX}/%`)}`
  );
}

async function up(mode) {
  const m = made();
  const lesson = m.lessons?.[0];
  if (!lesson) throw new Fail("the made course has no celse");
  await clean(m);
  const course = m.course;
  const key = (id) => `${PREFIX}/${course}/${id}`;
  const ids = {};

  // the homework, as its müderris sets it (the API); a recited one is read on Değerlendirme, a file one on Ödevler
  await must(HOCA, "PUT", `/lessons/${lesson}/assignment`, {
    description: HOMEWORK,
    kind: mode === "evaluation" ? "MEMORIZE" : "FILE",
  });

  if (mode === "homework") {
    // the talebe's own row, as the page's first write makes it (a note of null), then its one file, which no API can add here
    await must(TALEBE, "PUT", `/lessons/${lesson}/submission`, { note: null });
    ids.submissionFile = randomUUID();
    await put(
      `insert into submission_files (id, submission_id, storage_key, file_name, content_type, size_bytes)
       select ${q(ids.submissionFile)}, s.id, ${q(key(ids.submissionFile))}, ${q(FILES.submission.name)}, ${q(PDF)}, ${FILES.submission.bytes}
       from lesson_submissions s
       where s.lesson_id = ${q(lesson)} and s.user_id = ${q(subOf(TALEBE))}`,
      1
    );
  }

  if (mode === "curriculum") {
    ids.courseFile = randomUUID();
    ids.lessonFile = randomUUID();
    ids.assignmentFile = randomUUID();
    await put(
      `insert into course_resources (id, course_id, name, storage_key, file_name, content_type, size_bytes, order_index)
         values (${q(ids.courseFile)}, ${q(course)}, 'Kaynak listesi', ${q(key(ids.courseFile))}, ${q(FILES.courseResource.name)}, ${q(PDF)}, ${FILES.courseResource.bytes}, 0)`,
      1
    );
    await put(
      `insert into lesson_resources (id, lesson_id, name, storage_key, file_name, content_type, size_bytes, order_index)
         values (${q(ids.lessonFile)}, ${q(lesson)}, 'Celse notları', ${q(key(ids.lessonFile))}, ${q(FILES.lessonResource.name)}, ${q(PDF)}, ${FILES.lessonResource.bytes}, 0)`,
      1
    );
    await put(
      `insert into lesson_assignment_files (id, assignment_id, storage_key, file_name, content_type, size_bytes)
         select ${q(ids.assignmentFile)}, a.id, ${q(key(ids.assignmentFile))}, ${q(FILES.assignment.name)}, ${q(PDF)}, ${FILES.assignment.bytes}
         from lesson_assignments a where a.lesson_id = ${q(lesson)}`,
      1
    );
  }

  write({ mode, course, lesson, ...ids });
  return `${mode}: course ${course}, celse ${lesson}, ${Object.keys(ids).length} file row(s), the homework set`;
}

run("files-data", async () => {
  const [verb, mode, ...rest] = process.argv.slice(2);
  const usage = `usage: files-data.mjs up <${MODES.join("|")}> | down`;
  if (verb === "up") {
    if (!MODES.includes(mode) || rest.length) throw new Fail(usage, 2);
    console.log(
      `files-data up ${await up(mode)} (${accountKey(TALEBE)} holds the seat)`
    );
  } else if (verb === "down") {
    if (mode !== undefined) throw new Fail(usage, 2);
    const data = read();
    let m = null;
    try {
      m = made();
    } catch {
      // the course is gone already: its rows went with it
    }
    if (m) await clean(m);
    else
      await query(
        `delete from storage_deletions where storage_key like ${q(`${PREFIX}/%`)}`
      );
    rmSync(JSON_FILE, { force: true });
    console.log(
      `files-data down rows of ${data.course ?? m?.course ?? "no course"} taken away, the data file removed`
    );
  } else {
    throw new Fail(usage, 2);
  }
});
