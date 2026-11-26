// What tedris.files.download needs on top of `helpers/course.mjs make filesdl` (the course itself is made and removed there), as the flow's
// setup and teardown, and what its effects read through curl:
//
//   node ../tedris/files/download/files-data.mjs up      the made course gets the resources and the homework the flow reads (below); writes
//                                                        graphs/.local/files-download.json and a web session of the walk's talebe
//   node ../tedris/files/download/files-data.mjs signin  a new web session into graphs/.local/files-download.session.curl (the access token
//                                                        lives 5 minutes; the effects ask for a new one first)
//   node ../tedris/files/download/files-data.mjs down    the rows and the files this helper wrote are taken away, the stale deletions it
//                                                        could have queued too; run it BEFORE `course.mjs remove filesdl`
//
// The made course: `course.mjs make filesdl --kosk <kosk2> --weeks 1 --lessons 2 --hoca MUDERRIS --talebe applicantG`, one week of two celses,
// tomorrow and in three days at 21:00 in Istanbul; applicantG holds a seat. Nothing seeded is touched and no other account is.
//
// What `up` adds, on the first celse and on the course (names are the words of ui.yaml `samples`, so the replay compares the page with them):
//   course resources   a link "Sarf için okuma listesi" and a FILE "Sarf çalışma kâğıdı" (PDF, 12 kB)
//   celse resources    a link "Celse için ek okuma" and a FILE "Celse notları" (PDF, 24 kB)
//   homework           the müderris sets it (PUT /lessons/<celse>/assignment, the API, as MUDERRIS) and has one FILE "Ödev kâğıdı" (PDF, 36 kB)
// The API writes none of the three file rows: every upload route answers 503 STORAGE_NOT_CONFIGURED, because the stack has no storage (the
// BUNNY_STORAGE_* keys are not set), and a course's resources are written only by the whole-course PUT, which would replace the whole
// programme. So the three file rows and the two links are SQL: course_resources, lesson_resources and lesson_assignment_files, each with
// a storage_key that names no object (`graphs-files/<course>/<id>`). A download therefore answers 503 STORAGE_NOT_CONFIGURED (the service asks
// the store first), which is exactly the refusal the flow walks; a row of the course page cannot tell a real file from these.
// `down` deletes those rows (and any `storage_deletions` row with the prefix, which the course purge would queue for them), and the course
// is deleted afterwards by `course.mjs remove filesdl`, which has nothing of ours left to queue.
//
// Why curl and a cookie. The three routes the flow's effects read are tedris-web's own: they answer a signed-in browser (a cookie) or a visitor.
// A curl needs the cookie in a file, not on its command line:
//   graphs/.local/files-download.session.curl   the web session's `Cookie` header of applicantG (mode 600, git-ignored)
// and the effect runs `curl -sS -D - -K ../.local/files-download.session.curl ...`, so a status line, the headers and the body are on its
// stdout and no secret on its argv. The web session is made the way the browser makes it: the app's own /api/auth/signin, Keycloak's form, the
// callback (no password grant, no token minted).
// The json file holds ids only: course, lesson, lesson2, courseFile, ownFile, assignmentFile, assignment.
// Run it under the replay lock when it is run by hand (it writes). Prints `files-data <mode> <what was done>`. Nothing secret is printed.
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
  env,
  Fail,
  LOCAL,
  must,
  run,
} from "../../../bindings/helpers/lib.mjs";

const WEB = (process.env.TEDRIS_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const TALEBE = "applicantG";
const TAG = "filesdl";
const PREFIX = "graphs-files";
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const JSON_FILE = resolve(LOCAL, "files-download.json");
const SESSION_CURL = resolve(LOCAL, "files-download.session.curl");
const timeout = () => AbortSignal.timeout(60_000);

// the words of ui.yaml `samples`: keep them the same
const NAMES = {
  courseLink: "Sarf için okuma listesi",
  courseFile: "Sarf çalışma kâğıdı",
  ownLink: "Celse için ek okuma",
  ownFile: "Celse notları",
  assignmentFile: "Ödev kâğıdı",
};
const HOMEWORK = "Üçüncü bâbın çekimlerini deftere yaz ve sonraki derse getir.";
const PDF = "application/pdf";

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const list = (ids) => ids.map(q).join(", ");

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

// ---- a web session, made over HTTP the way the browser makes it ----
const remember = (res, jar) => {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const name = pair.slice(0, pair.indexOf("="));
    const value = pair.slice(pair.indexOf("=") + 1);
    if (/;\s*Max-Age=0\b/i.test(c) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
};
const header = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function webSession(account) {
  const key = accountKey(account);
  const web = new Map();
  const kc = new Map();
  const start = await fetch(
    `${WEB}/api/auth/signin?callbackUrl=%2Fhome&auto=1`,
    { redirect: "manual", signal: timeout() }
  );
  remember(start, web);
  const auth = start.headers.get("location");
  if (start.status !== 303 || !auth?.includes("/protocol/openid-connect/auth"))
    throw new Fail(
      `the web app's sign-in did not send the browser to Keycloak (status ${start.status})`
    );
  const page = await fetch(auth, { redirect: "manual", signal: timeout() });
  remember(page, kc);
  const html = await page.text();
  const action = /"loginAction"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  if (!action)
    throw new Fail(
      `Keycloak's page has no loginAction (status ${page.status})`
    );
  const post = await fetch(JSON.parse(`"${action}"`), {
    method: "POST",
    redirect: "manual",
    signal: timeout(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: header(kc),
    },
    body: new URLSearchParams({
      username: env()[`E2E_${key}_EMAIL`],
      password: env()[`E2E_${key}_PASSWORD`],
      credentialId: "",
    }),
  });
  const back = post.headers.get("location");
  if (
    post.status !== 302 ||
    !back?.startsWith(`${WEB}/api/auth/callback/keycloak`)
  )
    throw new Fail(
      `Keycloak did not hand back to the web app (status ${post.status})`
    );
  const callback = await fetch(back, {
    redirect: "manual",
    signal: timeout(),
    headers: { cookie: header(web) },
  });
  remember(callback, web);
  if (callback.status >= 400)
    throw new Fail(`the web app's callback answered ${callback.status}`);
  const me = await fetch(`${WEB}/api/auth/session`, {
    signal: timeout(),
    headers: { cookie: header(web) },
  });
  const who = await me.json().catch(() => null);
  if (!who?.user)
    throw new Fail("the web app holds no session after the callback");
  return header(web);
}

const sessionConfig = (cookie) => {
  writeFileSync(SESSION_CURL, `header = "Cookie: ${cookie}"\n`, {
    mode: 0o600,
  });
  chmodSync(SESSION_CURL, 0o600);
};

// what an earlier run left: this course's rows and the deletions queued for the fake keys
async function clean(m) {
  const lessons = list(m.lessons);
  await query(
    `delete from lesson_assignment_files where assignment_id in (select id from lesson_assignments where lesson_id in (${lessons}));
     delete from lesson_resources where lesson_id in (${lessons});
     delete from course_resources where course_id = ${q(m.course)};
     delete from storage_deletions where storage_key like ${q(`${PREFIX}/%`)}`
  );
}

run("files-data", async () => {
  const [mode] = process.argv.slice(2);
  if (mode === "up") {
    const m = made();
    if (!m.lessons?.[0]) throw new Fail("the made course has no celse");
    await clean(m);
    const course = m.course;
    const lesson = m.lessons[0];
    const ids = {
      courseFile: randomUUID(),
      ownFile: randomUUID(),
      assignmentFile: randomUUID(),
    };
    // the homework, as its müderris sets it
    await must("muderris", "PUT", `/lessons/${lesson}/assignment`, {
      description: HOMEWORK,
      kind: "FILE",
    });
    const row = await query(
      `select id from lesson_assignments where lesson_id = ${q(lesson)}`
    );
    const assignment = JSON.parse(row.trim().split("\n")[0] || "{}").id;
    if (!assignment) throw new Fail("the homework was not made");
    const key = (id) => `${PREFIX}/${course}/${id}`;
    await query(
      `insert into course_resources (course_id, name, url, order_index)
         values (${q(course)}, ${q(NAMES.courseLink)}, 'https://example.org/sarf-okuma-listesi', 0);
       insert into course_resources (id, course_id, name, storage_key, file_name, content_type, size_bytes, order_index)
         values (${q(ids.courseFile)}, ${q(course)}, ${q(NAMES.courseFile)}, ${q(key(ids.courseFile))}, 'sarf-calisma-kagidi.pdf', ${q(PDF)}, 12288, 1);
       insert into lesson_resources (lesson_id, name, url, order_index)
         values (${q(lesson)}, ${q(NAMES.ownLink)}, 'https://example.org/celse-ek-okuma', 0);
       insert into lesson_resources (id, lesson_id, name, storage_key, file_name, content_type, size_bytes, order_index)
         values (${q(ids.ownFile)}, ${q(lesson)}, ${q(NAMES.ownFile)}, ${q(key(ids.ownFile))}, 'celse-notlari.pdf', ${q(PDF)}, 24576, 1);
       insert into lesson_assignment_files (id, assignment_id, storage_key, file_name, content_type, size_bytes)
         values (${q(ids.assignmentFile)}, ${q(assignment)}, ${q(key(ids.assignmentFile))}, 'odev-kagidi.pdf', ${q(PDF)}, 36864)`
    );
    write({
      course,
      lesson,
      lesson2: m.lessons[1] ?? lesson,
      assignment,
      ...ids,
    });
    sessionConfig(await webSession(TALEBE));
    console.log(
      `files-data up two links and three files (course ${course}, celse ${lesson}), the homework and a web session of ${accountKey(TALEBE)} are made`
    );
  } else if (mode === "signin") {
    if (!read().course) throw new Fail("`up` has not run");
    sessionConfig(await webSession(TALEBE));
    console.log("files-data signin a new web session");
  } else if (mode === "down") {
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
    for (const f of [JSON_FILE, SESSION_CURL]) rmSync(f, { force: true });
    console.log(
      `files-data down rows of ${data.course ?? m?.course ?? "no course"} taken away, the session and the data file removed`
    );
  } else {
    throw new Fail("usage: files-data.mjs up|signin|down", 2);
  }
});
