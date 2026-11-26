// Makes what nazar.homework.review needs and the seed has not got, and takes it away again (the flow's setup and teardown): a published course of
// the walk's own with the talebe `applicantC` seated, homework on its first two celses, the talebe's hand-in on the first (a file, and for `changed` a
// note) and, as the scenario needs, a review that is attached and not sent, or sent, or sent and then changed by the talebe.
//
//   node ../nazar/homework/review/review-data.mjs make <variant>
//   node ../nazar/homework/review/review-data.mjs remove
//
//   <variant>  none     the course has no homework and nobody handed in: the page says "Henüz ödev yok"
//              fresh    a hand-in with a file and no review
//              draft    the same, with one review file attached and not sent ("Gönderilmedi")
//              sent     the same, with a review sent that has one file and no note ("Değerlendirildi")
//              changed  a review with a note and a file was sent, and then the talebe added a note ("Sonradan değişti")
//              granted  `fresh`, in a course of the seeded medrese whose müderris is the başmüderris, and the ders nazırı holding submission.read
//              refused  a course of the same kind, and the ders nazırı holding enrollment.decide only (no submission.read)
//
// Run by hand, it changes data: run it under the replay lock, as a replay does. Both commands are idempotent (make removes what an earlier make left),
// so a walk that died leaves nothing the next one trips on. The seeded courses, their homework and their hand-ins, and every other account, are never
// touched. The talebe's seat is applicantC's; it leaves with the course.
//
// What it uses. The course is made by helpers/course.mjs (`make nhwrev --weeks 1 --lessons 3 --talebe applicantC`, which writes
// graphs/.local/made/nhwrev.json for the binding's {made.*}: the course and its three celses; this helper adds `submission`, the hand-in's id). The
// homework is set the way nazar does it, PUT /lessons/{id}/assignment as the hoca. The talebe's row is made the way their page does it, PUT
// /lessons/{id}/submission as the talebe (a note of null makes the row). The review is sent the way the dialog does it, PUT /courses/{id}/submissions/
// {submissionId}/review as the reviewer. The ders nazırı's post is set with helpers/course-nazir-grants.mjs, as the başmüderris.
//
// WHAT IS WRITTEN BY SQL, AND WHY. The files. The only way a file gets into a hand-in or a review is the upload route, which answers 503
// STORAGE_NOT_CONFIGURED on the local stack (no Bunny Storage), so there is no API to make a file with. The rows go into `submission_files` and
// `submission_review_files` under storage keys that start with `walk/homework-review/`, which no object backs. Nothing reads an object except a
// download, and a download answers 503 here before it looks at the row. Removing such a review file through the page deletes its row and queues its
// key in `storage_deletions`, where it waits for a sweep that does nothing without storage; deleting the course does the same for every row left.
// `remove` therefore ends by deleting the `storage_deletions` rows with that prefix, which are ours alone. Nothing else is written by SQL.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HELPERS = resolve(here, "../../../bindings/helpers");
const TAG = "nhwrev";
const TALEBE = "applicantC";
const DERS_NAZIR = "dersNazir";
const PREFIX = "walk/homework-review/";
const HOMEWORK =
  "Üçüncü bâbın mâzî ve muzârî çekimlerini deftere yaz ve sonraki derse getir.";
// the words the walk's page shows: the same as the `note` sample of the binding, and the note of the review
const HAND_IN_NOTE = "Düzeltmeyi ekledim; üçüncü satırı yeniden yazdım.";
const REVIEW_NOTE =
  "Çekimlerin doğru; ikinci tablodaki iki satırı düzelttim, ekteki dosyaya bak.";
const HAND_IN_FILE = { name: "ödev.pdf", bytes: 20480 };
const REVIEW_FILE = { name: "duzeltilmis-odev.pdf", bytes: 1_572_864 };
const VARIANTS = [
  "none",
  "fresh",
  "draft",
  "sent",
  "changed",
  "granted",
  "refused",
];

// the shared helpers, as children: they are commands, not modules
function helper(script, ...args) {
  const r = spawnSync(process.execPath, [resolve(HELPERS, script), ...args], {
    cwd: HELPERS,
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Fail(
      `${script} ${args[0]}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`
    );
  return r.stdout.trim();
}

const madeFile = resolve(LOCAL, "made", `${TAG}.json`);
const made = () => JSON.parse(readFileSync(madeFile, "utf8"));
const keep = (m) =>
  writeFileSync(madeFile, `${JSON.stringify(m)}\n`, { mode: 0o600 });

// a statement that writes: it must have changed the rows we expect
async function write(sql, rows) {
  const out = (await query(sql)).trim();
  if (out !== `{"rows":${rows}}`)
    throw new Fail(`expected ${rows} row(s) written, got: ${out}`);
}

async function remove() {
  const said = helper("course.mjs", "remove", TAG);
  await query(
    `delete from storage_deletions where storage_key like '${PREFIX}%'`
  );
  return said;
}

async function make(variant) {
  await remove(); // what a walk that died left, and a tag made before
  const inMedrese = variant === "granted" || variant === "refused";
  const hoca = inMedrese ? "basmuderris" : "muderris";
  const args = [
    "make",
    TAG,
    "--weeks",
    "1",
    "--lessons",
    "3",
    "--talebe",
    TALEBE,
  ];
  if (inMedrese)
    args.push("--madrasah", seed().madrasah, "--hoca", "basmuderris");
  const m = JSON.parse(
    helper("course.mjs", ...args)
      .split("\n")
      .pop()
  );
  const [first, second] = m.lessons;
  if (variant === "refused") {
    helper(
      "course-nazir-grants.mjs",
      "--course",
      m.course,
      "--nazir",
      DERS_NAZIR,
      "--codes",
      "enrollment.decide",
      "--as",
      "basmuderris"
    );
    return `${variant} course ${m.course}, ${DERS_NAZIR} holds enrollment.decide only`;
  }
  if (variant === "none")
    return `${variant} course ${m.course}, no homework, no hand-in`;

  // the hoca sets homework on two celses; the third has none and nobody hands in on it
  for (const lesson of [first, second])
    await must(hoca, "PUT", `/lessons/${lesson}/assignment`, {
      description: HOMEWORK,
      kind: "FILE",
    });
  // the talebe's hand-in on the first: a row made the way the page makes it, then one file by SQL (no note)
  await must(TALEBE, "PUT", `/lessons/${first}/submission`, { note: null });
  const list = await must(
    hoca,
    "GET",
    `/courses/${m.course}/submissions?lessonId=${first}`
  );
  const mine = (list.body?.items ?? []).find(
    (i) => i.talebe?.id === subOf(TALEBE)
  );
  if (!mine?.id)
    throw new Fail(`${accountKey(TALEBE)} has no hand-in on the first celse`);
  await write(
    `insert into submission_files (submission_id, storage_key, file_name, content_type, size_bytes)
     values ('${mine.id}', '${PREFIX}${first}/hand-in.pdf', '${HAND_IN_FILE.name}', 'application/pdf', ${HAND_IN_FILE.bytes})`,
    1
  );
  keep({ ...made(), submission: mine.id, variant });

  if (variant === "granted")
    helper(
      "course-nazir-grants.mjs",
      "--course",
      m.course,
      "--nazir",
      DERS_NAZIR,
      "--codes",
      "submission.read",
      "--as",
      "basmuderris"
    );

  // the review: a file attached (draft), sent with no note (sent), or with a note and then changed by the talebe (changed)
  if (variant === "draft" || variant === "sent" || variant === "changed") {
    await write(
      `insert into submission_review_files (submission_id, storage_key, file_name, content_type, size_bytes, uploaded_by)
       values ('${mine.id}', '${PREFIX}${first}/review.pdf', '${REVIEW_FILE.name}', 'application/pdf', ${REVIEW_FILE.bytes}, '${subOf(hoca)}')`,
      1
    );
  }
  if (variant === "sent" || variant === "changed") {
    await must(
      hoca,
      "PUT",
      `/courses/${m.course}/submissions/${mine.id}/review`,
      {
        note: variant === "changed" ? REVIEW_NOTE : null,
      }
    );
  }
  if (variant === "changed") {
    // later than the send, so that the hand-in is newer than the review ("Sonradan değişti")
    await new Promise((r) => setTimeout(r, 1200));
    await must(TALEBE, "PUT", `/lessons/${first}/submission`, {
      note: HAND_IN_NOTE,
    });
  }
  return `${variant} course ${m.course}, hand-in ${mine.id}`;
}

run("review-data", async () => {
  const [verb, variant, ...rest] = process.argv.slice(2);
  const usage = `usage: review-data.mjs make <${VARIANTS.join("|")}> | remove`;
  if (verb === "make") {
    if (!VARIANTS.includes(variant) || rest.length) throw new Fail(usage, 2);
    console.log(`review-data make ${await make(variant)}`);
  } else if (verb === "remove") {
    if (variant !== undefined) throw new Fail(usage, 2);
    console.log(`review-data remove ${await remove()}`);
  } else throw new Fail(usage, 2);
});
