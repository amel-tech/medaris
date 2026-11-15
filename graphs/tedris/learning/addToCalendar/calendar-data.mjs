// What tedris.learning.addToCalendar needs besides its course, and what its effects read through curl (the flow's setup, teardown and
// effects). The course is the walk's own, made first by `helpers/course.mjs make addToCalendar --weeks 1 --lessons 3 --start -1 --talebe
// APPLICANT_H` (the köşk's second one, one müderris, three live celses: one yesterday, one tomorrow, one in three days) and removed by
// `helpers/course.mjs remove addToCalendar`; nothing seeded is touched. The walk's talebe is the spare `applicantH`, who holds a seat
// only there, so Programım lists that course's two upcoming celses and the feed holds that course's three. The one thing this helper
// writes is applicantH's calendar feed link (POST /me/calendar-feed), which `down` deletes again.
//
//   node ../tedris/learning/addToCalendar/calendar-data.mjs up          the next upcoming celse of the made course, a feed link, and a signed-in web session;
//                                                                       writes graphs/.local/add-to-calendar.json and the two curl configs below
//   node ../tedris/learning/addToCalendar/calendar-data.mjs signin      a new web session into the lesson curl config (the access token lives 5 minutes)
//   node ../tedris/learning/addToCalendar/calendar-data.mjs down        the feed link and the files are removed; a course this helper hid is brought back
//   node ../tedris/learning/addToCalendar/calendar-data.mjs hide        hides the made course (as the başnazım), so a page drawn before still lists the row and the file call answers 404
//   node ../tedris/learning/addToCalendar/calendar-data.mjs unhide      the way back (also done by `up` and `down`, if `hide` left a mark)
//   node ../tedris/learning/addToCalendar/calendar-data.mjs absent <lesson|feed> <text>   prints `absent <text>` when the .ics answer does not contain the text, fails when it does
//
// Why curl and a cookie. The two routes the flow checks are tedris-web's own: GET /api/lessons/<id>/calendar answers only a signed-in
// browser (a cookie), GET /calendar/<token>.ics only the address' secret. A curl needs both in a file, not on its command line:
//   graphs/.local/add-to-calendar.lesson.curl   `url` of the file route and the web session's `Cookie` header (mode 600, git-ignored)
//   graphs/.local/add-to-calendar.feed.curl     `url` of the feed, token included (mode 600, git-ignored)
// and the effect runs `curl -sS -D - -K ../.local/add-to-calendar.lesson.curl`, so a status line, the headers and the body are on its
// stdout, and no secret on its argv. The web session is made the way the browser makes it: the app's own /api/auth/signin, Keycloak's
// form, the callback (no password grant, no token minted).
// The json file holds ids and titles only: lesson (the next upcoming celse), past (the celse that was held), course, title, courseTitle,
// week, startsAt, feed (the file name, `<43 chars>.ics`) and `hidden`.
// Run it under the replay lock when it is run by hand (it writes). Prints `calendar-data <mode> <what was done>`. Nothing secret is printed.
import { spawn } from "node:child_process";
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
  call,
  env,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const WEB = (process.env.TEDRIS_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const TALEBE = "applicantH";
const MADE = resolve(LOCAL, "made", "addToCalendar.json");
const JSON_FILE = resolve(LOCAL, "add-to-calendar.json");
const LESSON_CURL = resolve(LOCAL, "add-to-calendar.lesson.curl");
const FEED_CURL = resolve(LOCAL, "add-to-calendar.feed.curl");
const timeout = () => AbortSignal.timeout(60_000);

const read = () =>
  existsSync(JSON_FILE) ? JSON.parse(readFileSync(JSON_FILE, "utf8")) : {};
const write = (data) => {
  writeFileSync(JSON_FILE, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(JSON_FILE, 0o600);
};
const secret = (file, text) => {
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
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
    `${WEB}/api/auth/signin?callbackUrl=%2Fschedule&auto=1`,
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
  // the proof that a session exists: its own session route
  const me = await fetch(`${WEB}/api/auth/session`, {
    signal: timeout(),
    headers: { cookie: header(web) },
  });
  const who = await me.json().catch(() => null);
  if (!who?.user)
    throw new Fail("the web app holds no session after the callback");
  return header(web);
}

const configFor = (lines) => `${lines.join("\n")}\n`;
async function lessonConfig(data, cookie) {
  secret(
    LESSON_CURL,
    configFor([
      `url = "${WEB}/api/lessons/${data.lesson}/calendar?locale=tr"`,
      `header = "Cookie: ${cookie}"`,
    ])
  );
}

// ---- the celse and the course ----
async function nextCelse(account, made) {
  const day = 86_400_000;
  const from = new Date(Date.now() - 60_000);
  const to = new Date(from.getTime() + 7 * day);
  const r = await must(
    account,
    "GET",
    `/sessions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
  );
  const list = (Array.isArray(r.body) ? r.body : (r.body?.items ?? []))
    .filter(
      (s) =>
        s.courseId === made.course &&
        s.status === "SCHEDULED" &&
        new Date(s.startsAt) > new Date()
    )
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  if (list.length === 0)
    throw new Fail(
      `${account} has no upcoming celse of the made course in the next 7 days`
    );
  const s = list[0];
  return {
    lesson: s.id,
    past: made.lessons[0],
    course: s.courseId,
    title: s.title,
    courseTitle: s.courseTitle,
    week: s.weekNumber,
    startsAt: s.startsAt,
  };
}

// A meeting link on every celse of the made course, put there by its hoca, so that "no meeting link in the file" is a check that can fail.
const MEETING = "https://meet.example.test/ders-takvim";
async function giveMeetingLinks(made) {
  for (const id of made.lessons) {
    const course = (await must("MUDERRIS", "GET", `/courses/${made.course}`))
      .body;
    await must("MUDERRIS", "PATCH", `/lessons/${id}`, {
      version: course.version,
      meetingUrl: MEETING,
    });
  }
}

const hide = async (data) => {
  const r = await call(
    "systemAdmin",
    "POST",
    `/courses/${data.course}/archive`
  );
  if (r.status !== 200 && r.status !== 409)
    throw new Fail(`hiding the course answered ${r.status}`);
  write({ ...data, hidden: data.course });
  return r.status === 200 ? "hidden" : "was hidden already";
};
const unhide = async (data) => {
  if (!data.hidden) return "nothing hidden";
  const r = await call(
    "systemAdmin",
    "POST",
    `/courses/${data.hidden}/restore`
  );
  if (r.status !== 200 && r.status !== 409)
    throw new Fail(`bringing the course back answered ${r.status}`);
  const { hidden, ...rest } = data;
  write(rest);
  return r.status === 200 ? "brought back" : "was not hidden";
};

const feedLink = async (account) => {
  const r = await must(account, "POST", "/me/calendar-feed");
  const file = /\/calendar\/([A-Za-z0-9_-]{43}\.ics)$/.exec(
    r.body?.url ?? ""
  )?.[1];
  if (!file) throw new Fail("the feed link has no 43-character token");
  return file;
};

// `curl -sS -D - -K <file>` as the effect runs it, here to read the answer
const curl = (file) =>
  new Promise((done, fail) => {
    const p = spawn("curl", ["-sS", "-D", "-", "-K", file], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) =>
      code === 0 ? done(out) : fail(new Fail(`curl failed: ${err.trim()}`))
    );
  });

run("calendar-data", async () => {
  const [mode, a, b] = process.argv.slice(2);
  const data = read();
  if (mode === "up") {
    // a walk that crashed after `hide` left its mark: the course comes back first
    await unhide(data).catch(() => undefined);
    if (!existsSync(MADE))
      throw new Fail(
        "the course is not made: run helpers/course.mjs make addToCalendar first"
      );
    const made = JSON.parse(readFileSync(MADE, "utf8"));
    await giveMeetingLinks(made);
    const celse = await nextCelse(TALEBE, made);
    const feed = await feedLink(TALEBE);
    const now = { ...celse, feed };
    write(now);
    secret(FEED_CURL, configFor([`url = "${WEB}/calendar/${feed}"`]));
    await lessonConfig(now, await webSession(TALEBE));
    console.log(
      `calendar-data up the next celse is ${celse.title} of ${celse.courseTitle} (week ${celse.week}), a feed link and a web session are made`
    );
  } else if (mode === "signin") {
    if (!data.lesson) throw new Fail("`up` has not run");
    await lessonConfig(data, await webSession(TALEBE));
    console.log("calendar-data signin a new web session");
  } else if (mode === "hide") {
    if (!data.lesson) throw new Fail("`up` has not run");
    console.log(
      `calendar-data hide the course of the celse is ${await hide(data)}`
    );
  } else if (mode === "unhide") {
    console.log(`calendar-data unhide ${await unhide(data)}`);
  } else if (mode === "down") {
    const said = await unhide(data).catch(
      (e) => `not brought back (${e.message})`
    );
    const out = await query(
      `delete from calendar_feed_tokens where user_id = '${subOf(TALEBE)}' returning user_id`
    );
    for (const f of [JSON_FILE, LESSON_CURL, FEED_CURL])
      rmSync(f, { force: true });
    console.log(
      `calendar-data down course: ${said}; feed link: ${out.trim() ? "deleted" : "none"}; files removed`
    );
  } else if (mode === "absent") {
    if (!["lesson", "feed"].includes(a) || !b)
      throw new Fail("usage: absent <lesson|feed> <text>", 2);
    const answer = await curl(a === "lesson" ? LESSON_CURL : FEED_CURL);
    if (!/^HTTP\/[\d.]+ 200/.test(answer))
      throw new Fail(
        `the ${a} answer is not 200: ${answer.split("\n")[0].trim()}`
      );
    if (answer.includes(b)) throw new Fail(`the ${a} answer contains ${b}`);
    console.log(`calendar-data absent ${b} from the ${a} answer`);
  } else {
    throw new Fail(
      "usage: calendar-data.mjs up|signin|hide|unhide|down|absent",
      2
    );
  }
});
