// What the walks of nizam.grants.appoint make and take away besides the course (which helpers/course.mjs makes under the tag `nzgrants`,
// in the seed's second köşk, "Kubbealtı Köşkü"): the posts the page starts from, the days the end field is typed with, and the clean-up
// that leaves nothing behind. All through tedrisat's HTTP API: as the köşk's nazım (KOSK_NAZIM) for what the story has him do, as the
// başnazım (SYSTEM_ADMIN) for what only he may do (seat the nazım, seat himself, end a post elsewhere) and for the clean-up, so that
// nothing a crashed walk left can stand in the way of the next one.
//
//   node ../nizam/grants/appoint/grants-data.mjs up [--held] [--own] [--chief-own] [--handed-on]
//   node ../nizam/grants/appoint/grants-data.mjs gone
//   node ../nizam/grants/appoint/grants-data.mjs held <none|one> [ACCOUNT]
//   node ../nizam/grants/appoint/grants-data.mjs down
//
// The people: APPLICANT_C ("Esma Başvuran", a woman with a full profile and no enrolment) is the person the nazım appoints and the holder of
// the post the page starts from; APPLICANT_D holds a post that carries `course_nazir.assign` and APPLICANT_E is the person D appoints (the
// refusal DISMISS_SEAT_HANDED_ON). The seeded ders nazırı (DERS_NAZIR) is never touched.
//
//   up        (after `course.mjs make nzgrants --kosk <seed.kosk2> ...`) reads graphs/.local/made/nzgrants.json, writes
//             graphs/.local/nzgrants.json (a data source of the binding: {grants.spare.sub|name|email}, {grants.holder.*}, {grants.appointee.*},
//             {grants.viewer.*} (the nazım, or the başnazım with --chief-own), {grants.today}, {grants.future}, {grants.futureMs},
//             {grants.futureLabel}, {grants.past}, {grants.postSpare}, ...) and prints `nzgrants up`.
//               --held        the nazım appoints the spare with "Celse ..." and "Başvuruyu ..." and an end 30 days ahead (the e2e's seeded post,
//                             grants.e2e.ts, with a date that does not run out): the list has one row of another person
//               --own         the başnazım seats the nazım himself, with the same two permissions and no end: the nazım's own row
//               --chief-own   the başnazım seats himself, the same: the başnazım's own row (SYSTEM_ADMIN is not asked about himself)
//               --handed-on   the nazım appoints D with the two permissions and `course_nazir.assign` and an end 30 days ahead, then D appoints E
//                             from the course with no permission and the same end: the list has two rows, and D's post cannot be ended
//                             while E holds hers
//   gone      the başnazım ends the spare's post while the dialog is open: DELETE /kosks/:id/grants/:postId. Safe to run twice.
//   held      fails unless the account (default: the spare) holds `none` or `one` live post in the course. Prints `nzgrants held <what> <ACCOUNT>`.
//   down      ends every post in the recorded course (the posts that were appointed from the course first, so that DISMISS_SEAT_HANDED_ON does
//             not stand in the way) and removes the data file. Run it before `course.mjs make` as well as after: it reads what the last walk
//             recorded. Nothing recorded is `nzgrants down 0`.
//
// Times are the ones the page uses: the viewer's zone is the app's default, Europe/Istanbul (UTC+3 all year), and the end field takes
// `YYYY-MM-DDTHH:mm`. What these cannot undo: the audit rows (user.lookup, course_nazir.assign, course_nazir.update, course_nazir.revoke,
// permission.self_grant_refused), the revoked role and grant rows kept as history, and the invitation mails of the course (course.mjs remove
// clears them).
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

const TAG = "nzgrants";
const SPARE = "APPLICANT_C";
const HOLDER = "APPLICANT_D";
const APPOINTEE = "APPLICANT_E";
const NAZIM = "KOSK_NAZIM";
const CHIEF = "SYSTEM_ADMIN";
const TWO = ["session.manage", "enrollment.decide"]; // "Celse ekle, ..." and "Başvuruyu onayla ya da reddet" (e2e grants#4)
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const DATA = resolve(LOCAL, "nzgrants.json");
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
const person = async (account) => ({
  sub: subOf(account).toLowerCase(),
  name: await nameOf(account),
  email: env()[`E2E_${accountKey(account)}_EMAIL`],
});

function keep(data) {
  mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
  writeFileSync(DATA, `${JSON.stringify(data)}\n`, { mode: 0o600 });
}

/** The list the page reads, as the başnazım (who may read every köşk's). */
async function listOf(data) {
  const r = await call(CHIEF, "GET", `/kosks/${data.kosk}/grants`);
  if (r.status === 404) return [];
  if (r.status !== 200)
    throw new Fail(`GET /kosks/${data.kosk}/grants answered ${r.status}`);
  return (r.body.items ?? []).filter(
    (item) => item.course?.id?.toLowerCase() === data.course.toLowerCase()
  );
}

const postOf = (items, sub) =>
  items.find((item) => item.user?.id?.toLowerCase() === sub)?.id ?? null;

async function up(args) {
  const o = options(args, {
    flags: ["held", "own", "chief-own", "handed-on"],
  });
  if (o.rest.length)
    throw new Fail("usage: up [--held] [--own] [--chief-own] [--handed-on]", 2);
  if (!existsSync(MADE))
    throw new Fail(`${MADE} does not exist: run course.mjs make ${TAG} first`);
  const made = read(MADE);
  const future = at18(30);
  const past = at18(-30);
  const data = {
    kosk: made.kosk,
    course: made.course,
    title: made.title,
    spare: await person(SPARE),
    holder: await person(HOLDER),
    appointee: await person(APPOINTEE),
    nazim: await person(NAZIM),
    chief: await person(CHIEF),
    viewer: await person(o["chief-own"] ? CHIEF : NAZIM),
    today: label(Date.now()),
    future: future.field,
    futureMs: future.ms,
    futureLabel: label(future.ms),
    past: past.field,
    postSpare: null,
    postHolder: null,
    postAppointee: null,
    postOwn: null,
  };
  keep(data); // recorded at once: a failure below is still cleaned by `down`
  const give = (as, who, permissions, endsAt) =>
    must(as, "POST", `/kosks/${made.kosk}/grants`, {
      userId: who.sub,
      courseId: made.course,
      permissions,
      ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
    });
  if (o.held) {
    const r = await give(NAZIM, data.spare, TWO, future.ms);
    data.postSpare = postOf(r.body.items, data.spare.sub);
  }
  if (o.own) {
    const r = await give(CHIEF, data.nazim, TWO);
    data.postOwn = postOf(r.body.items, data.nazim.sub);
  }
  if (o["chief-own"]) {
    const r = await give(CHIEF, data.chief, TWO);
    data.postOwn = postOf(r.body.items, data.chief.sub);
  }
  if (o["handed-on"]) {
    const r = await give(
      NAZIM,
      data.holder,
      [...TWO, "course_nazir.assign"],
      future.ms
    );
    data.postHolder = postOf(r.body.items, data.holder.sub);
    // made from the course itself (the API's own e2e does the same): the post names D as the one who appointed E; both end on the same day
    await must(HOLDER, "POST", `/courses/${made.course}/nazirs`, {
      userId: data.appointee.sub,
      permissions: [],
      endsAt: new Date(future.ms).toISOString(),
    });
    data.postAppointee = postOf(await listOf(data), data.appointee.sub);
  }
  keep(data);
  console.log(
    `nzgrants up${o.held ? " held" : ""}${o.own ? " own" : ""}${o["chief-own"] ? " chief-own" : ""}${o["handed-on"] ? " handed-on" : ""}`
  );
}

async function gone() {
  const data = read(DATA);
  if (!data.postSpare) throw new Fail("no held post was made: up --held first");
  await must(
    CHIEF,
    "DELETE",
    `/kosks/${data.kosk}/grants/${data.postSpare}`,
    undefined,
    [404] // already ended: fine
  );
  console.log("nzgrants gone");
}

async function held(args) {
  const [what, account = SPARE, ...more] = args;
  if (!["none", "one"].includes(what) || more.length)
    throw new Fail("usage: held <none|one> [ACCOUNT]", 2);
  const data = read(DATA);
  const who = subOf(account).toLowerCase();
  const posts = (await listOf(data)).filter(
    (item) => item.user?.id?.toLowerCase() === who
  );
  if (what === "none" && posts.length > 0)
    throw new Fail(
      `${accountKey(account)} holds ${posts.length} post(s); none expected`
    );
  if (what === "one" && posts.length !== 1)
    throw new Fail(
      `${accountKey(account)} holds ${posts.length} post(s); one expected`
    );
  console.log(`nzgrants held ${what} ${accountKey(account)}`);
}

async function down() {
  if (!existsSync(DATA)) {
    console.log("nzgrants down 0");
    return;
  }
  const data = read(DATA);
  let ended = 0;
  // the posts made from the course (their giver is not the nazım or the başnazım) first: DISMISS_SEAT_HANDED_ON refuses the other order
  for (let pass = 0; pass < 4; pass++) {
    const items = await listOf(data);
    if (items.length === 0) break;
    const rank = (item) =>
      [data.nazim.sub, data.chief.sub].includes(
        item.grantedBy?.id?.toLowerCase()
      )
        ? 1
        : 0;
    for (const item of [...items].sort((a, b) => rank(a) - rank(b))) {
      const r = await call(
        CHIEF,
        "DELETE",
        `/kosks/${data.kosk}/grants/${item.id}`
      );
      if (r.status === 204) ended++;
      else if (![404, 409].includes(r.status))
        throw new Fail(
          `DELETE /kosks/${data.kosk}/grants/${item.id} answered ${r.status}`
        );
    }
  }
  const left = await listOf(data);
  if (left.length > 0)
    throw new Fail(
      `${left.length} post(s) of ${data.title} could not be ended`
    );
  rmSync(DATA);
  console.log(`nzgrants down ${ended}`);
}

run("grants-data", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "up") await up(rest);
  else if (verb === "gone" && rest.length === 0) await gone();
  else if (verb === "held") await held(rest);
  else if (verb === "down" && rest.length === 0) await down();
  else
    throw new Fail(
      "usage: grants-data.mjs up [--held] [--own] [--chief-own] [--handed-on] | gone | held <none|one> [ACCOUNT] | down",
      2
    );
});
