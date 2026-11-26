// What the walks of nazar.courseNazirs.appoint make and take away besides the course (which helpers/course.mjs makes under the tag
// `nzappoint`): the spare talebe the hoca appoints, a post made "elsewhere" for the race, a ban for the barred case, and the days the
// end field is typed with. All through tedrisat's HTTP API, as the hoca (MUDERRIS) for what the story has her do, and as the
// başnazım (SYSTEM_ADMIN) for the clean-up, so that nothing a crashed walk left can stand in the way of the next one.
//
//   node ../nazar/courseNazirs/appoint/appoint-data.mjs up [--holder] [--bar] [--viewer <ACCOUNT>]
//   node ../nazar/courseNazirs/appoint/appoint-data.mjs elsewhere
//   node ../nazar/courseNazirs/appoint/appoint-data.mjs held <none|bare> [ACCOUNT]
//   node ../nazar/courseNazirs/appoint/appoint-data.mjs down
//
// The spare is APPLICANT_G ("Dilek Başvuran"), a woman with a full profile and no enrolment; the walks appoint nobody else, and never the
// seeded ders nazırı (DERS_NAZIR).
//
//   up        (after `course.mjs make nzappoint --madrasah ...`) reads graphs/.local/made/nzappoint.json, writes
//             graphs/.local/nzappoint.json (a data source of the binding: {appt.sub}, {appt.name}, {appt.email}, {appt.viewerName},
//             {appt.viewerSub}, {appt.viewerEmail}, {appt.today}, {appt.future}, {appt.futureMs}, {appt.futureLabel}, {appt.past}) and
//             prints `course-nazirs up`.
//               --holder   the hoca appoints the spare first, with no permission and no end (the list has her row: scenario `member`)
//               --bar      the hoca bars the spare from the course with a COURSE ban (scenario `barred`); the ban's id is kept for `down`
//               --viewer   who signs in and appoints: the hoca MUDERRIS (default), or BASMUDERRIS, who opens the course by its address
//                          (binding.head.yaml); the name, the id and the address the pages and the effects expect are hers
//   elsewhere someone else appoints the spare while the dialog is open: POST /courses/:id/nazirs as the hoca, no permission. Safe to run
//             twice (a post that exists is fine). Prints `course-nazirs elsewhere`.
//   held      reads the list as the hoca and fails unless the account (default: the spare) holds `none` (no live post) or `bare` (one
//             post, no permission, no end). Prints `course-nazirs held <what> <ACCOUNT>`.
//   down      dismisses the spare's post in the recorded course (DELETE as the başnazım), lifts the ban it made, and removes the data
//             file. Run it before `course.mjs make` as well as after: it reads what the last walk recorded, so a walk that died leaves
//             nothing the next one trips on. Nothing recorded is `course-nazirs down 0`.
//
// Times are the ones the page uses: the viewer's zone is the app's default, Europe/Istanbul (UTC+3 all year), and the end field takes
// `YYYY-MM-DDTHH:mm`. What these cannot undo: the audit rows (course_nazir.assign, course_nazir.revoke, user.lookup, ban.create and
// ban.lift), the revoked role and grant rows kept as history, and the invitation mails of the course (course.mjs remove clears them).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  call,
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "nzappoint";
const SPARE = "APPLICANT_G";
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const DATA = resolve(LOCAL, "nzappoint.json");
const DAY = 86_400_000;
const ZONE = "Europe/Istanbul";

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const label = (ms) =>
  new Intl.DateTimeFormat("tr", { dateStyle: "long", timeZone: ZONE }).format(
    ms
  );
// the day `days` from now, in the zone of the page, as the end field takes it at 18:00, and the instant that is
const at18 = (days) => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    Date.now() + days * DAY
  ); // YYYY-MM-DD
  return { field: `${day}T18:00`, ms: Date.parse(`${day}T18:00:00+03:00`) };
};

function keep(data) {
  mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
  writeFileSync(DATA, `${JSON.stringify(data)}\n`, { mode: 0o600 });
}

async function up(args) {
  const {
    holder,
    bar,
    viewer = "MUDERRIS",
    rest,
  } = options(args, {
    flags: ["holder", "bar"],
    values: ["viewer"],
  });
  if (rest.length)
    throw new Fail("usage: up [--holder] [--bar] [--viewer <ACCOUNT>]", 2);
  if (!existsSync(MADE))
    throw new Fail(`${MADE} does not exist: run course.mjs make ${TAG} first`);
  const made = read(MADE);
  const sub = subOf(SPARE).toLowerCase();
  const future = at18(30);
  const past = at18(-30);
  const data = {
    course: made.course,
    sub,
    name: await nameOf(SPARE),
    email: env()[`E2E_${accountKey(SPARE)}_EMAIL`],
    viewerName: await nameOf(viewer),
    viewerSub: subOf(viewer).toLowerCase(),
    viewerEmail: env()[`E2E_${accountKey(viewer)}_EMAIL`],
    today: label(Date.now()),
    future: future.field,
    futureMs: future.ms,
    futureLabel: label(future.ms),
    past: past.field,
    banId: null,
  };
  keep(data); // recorded at once: a failure below is still cleaned by `down`
  if (holder)
    await must("MUDERRIS", "POST", `/courses/${made.course}/nazirs`, {
      userId: sub,
      permissions: [],
    });
  if (bar) {
    const ban = await must("MUDERRIS", "POST", `/courses/${made.course}/bans`, {
      userId: sub,
      scope: "COURSE",
      reason: "Deneme için yasak.",
    });
    data.banId = ban.body.id;
    keep(data);
  }
  console.log(`course-nazirs up${holder ? " holder" : ""}${bar ? " bar" : ""}`);
}

async function elsewhere() {
  const data = read(DATA);
  await must(
    "MUDERRIS",
    "POST",
    `/courses/${data.course}/nazirs`,
    { userId: data.sub, permissions: [] },
    [409] // the post exists already: the race is made
  );
  console.log("course-nazirs elsewhere");
}

async function held(args) {
  const [what, account = SPARE, ...more] = args;
  if (!["none", "bare"].includes(what) || more.length)
    throw new Fail("usage: held <none|bare> [ACCOUNT]", 2);
  const data = read(DATA);
  const who = subOf(account).toLowerCase();
  const list = (await must("MUDERRIS", "GET", `/courses/${data.course}/nazirs`))
    .body;
  const posts = (list.items ?? []).filter(
    (post) => post.user?.id?.toLowerCase() === who
  );
  if (what === "none" && posts.length > 0)
    throw new Fail(
      `${accountKey(account)} holds ${posts.length} post(s); none expected`
    );
  if (what === "bare") {
    const [post] = posts;
    if (
      posts.length !== 1 ||
      post.permissions.length !== 0 ||
      post.endsAt !== null
    )
      throw new Fail(
        `${accountKey(account)}: expected one post with no permission and no end, found ${posts.length} (${posts.map((p) => `${p.permissions.length} permission(s), end ${p.endsAt}`).join("; ")})`
      );
  }
  console.log(`course-nazirs held ${what} ${accountKey(account)}`);
}

async function down() {
  if (!existsSync(DATA)) {
    console.log("course-nazirs down 0");
    return;
  }
  const data = read(DATA);
  let dismissed = 0;
  // the course may be gone already (a walk that died, then another make): the posts went with it or are not ours to find
  const list = await call(
    "SYSTEM_ADMIN",
    "GET",
    `/courses/${data.course}/nazirs`
  );
  if (list.status === 200) {
    for (const post of (list.body.items ?? []).filter(
      (p) => p.user?.id?.toLowerCase() === data.sub
    )) {
      await must(
        "SYSTEM_ADMIN",
        "DELETE",
        `/courses/${data.course}/nazirs/${post.id}`,
        undefined,
        [404]
      );
      dismissed++;
    }
  } else if (list.status !== 404) {
    throw new Fail(
      `GET /courses/${data.course}/nazirs answered ${list.status}`
    );
  }
  if (data.banId)
    // a ban already lifted, or gone with its course, is fine
    await must(
      "SYSTEM_ADMIN",
      "POST",
      `/bans/${data.banId}/lift`,
      { reason: "Deneme bitti." },
      [400, 404, 409]
    );
  rmSync(DATA);
  console.log(`course-nazirs down ${dismissed}`);
}

run("appoint-data", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "up") await up(rest);
  else if (verb === "elsewhere" && rest.length === 0) await elsewhere();
  else if (verb === "held") await held(rest);
  else if (verb === "down" && rest.length === 0) await down();
  else
    throw new Fail(
      "usage: appoint-data.mjs up [--holder] [--bar] [--viewer <ACCOUNT>] | elsewhere | held <none|bare> [ACCOUNT] | down",
      2
    );
});
