// The walk data of nizam.courseRequests.decide, made and taken away through tedrisat's HTTP API: course requests of the seeded medrese to the
// seeded köşk, "Süleymaniye Köşkü", that the köşk's nazım then reads on "Ders talepleri". It is the binding's `setup`, `teardown` and the
// "meanwhile" a race walk needs: `node requests.mjs up|down|meanwhile|counts|still-waiting|other-kosk ...`, run with graphs/bindings/ as the
// working directory (../nizam/courseRequests/decide/requests.mjs).
//
//   up [--waiting n] [--rejected n] [--accepted n] [--alone]
//        removes this walk's own requests first, then makes them, as the başmüderris, through the route nazar.offsite.requestCourse uses
//        (POST /madrasahs/:id/offsite-course-requests): `--waiting` of them stay PENDING (at most 2: "A", "B"); `--rejected` (at most 1,
//        "C") is refused by the köşk's nazım with an earlier reason, so that the Karara bağlanan tab holds one; `--accepted` (at most 1,
//        "D") is accepted by the nazım with a course of the walk's own (helpers/course.mjs, tag crd-accepted), so that the tab holds an
//        accepted one. --alone fails, naming the count, when the köşk holds any request that is not this walk's: a walk that presses Reddet
//        on the first row must be sure the first row is its own (never decide a request this walk did not make), and the empty and the
//        counts walks need an empty köşk. Prints `ready: <w> waiting, <r> rejected, <a> accepted` and writes graphs/.local/made/
//        courserequests-decide.json ({ kosk, madrasah, sender, reason, rejectReason, waiting, first, second, rejected, accepted }, each
//        request { id, title }; an id is null where that request was not made, the words are written all the same), which the binding reads
//        as the data source `made`.
//   down  removes this walk's own requests and every course whose title is a request's (a course the Ders aç form made from one), the course
//        of --accepted, and the made file. Safe to run twice. Prints `restored: <r> request(s), <c> course(s)`.
//   meanwhile none|answered|gone
//        what happens elsewhere while the dialog is open: `answered` (the köşk's nazım refuses the first request in another tab, with another
//        reason: the page's own refusal then meets COURSE_REQUEST_NOT_PENDING); `gone` (the first request is deleted: COURSE_REQUEST_NOT_FOUND).
//        Both are safe to run twice. Prints `meanwhile <mode>`.
//   counts   reads the tab counts as the köşk's nazım does (GET /kosks/:id/course-requests) and checks them against the database's own count
//        of the köşk's requests, waiting and answered. Prints `counts ok pending=<n> decided=<n>`.
//   still-waiting   checks that every request `up` left waiting still waits (what "Kabul et" leaves: it writes nothing). Prints `still-waiting <n>`.
//   other-kosk make|remove   a köşk of the walk's own, "Talep Başka Köşkü" (short name crd-baska), with applicantH as its nazım: the nazım of
//        another köşk, as e2e platform-admin#11 has them. `make` removes any köşk with that short name first. Prints `other-kosk ready` or
//        `other-kosk removed`.
//
// The one SQL it uses is the removal of requests (no route deletes one: the appeal of a request goes with it by cascade, the audit rows stay,
// and nothing can remove them), and the removal of `meanwhile gone`, and the two counts. Every id put into SQL is checked to be a uuid. Run it
// under the replay lock when walks are running and you run it by hand.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  call,
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const exec = promisify(execFile);
const TAG = "courserequests-decide";
const ACCEPTED_COURSE_TAG = "crd-accepted";
const PREFIX = "Deneme talebi courseRequests-decide ";
const FILE = resolve(LOCAL, "made", `${TAG}.json`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON =
  "Bu metni okutan bir ders medresemizde yok; müderrisliğini üstlenmek isteyen bir hoca var.";
const EARLIER_REASON = "Önceki dönemde reddedildi.";
const ELSEWHERE_REASON = "Başka bir nazım aynı anda karar verdi.";
const REJECT_REASON = "Kadro dolu."; // what the walk types in the dialog
const OTHER_HANDLE = "crd-baska";

const usage =
  "usage: requests.mjs up [--waiting n] [--rejected n] [--accepted n] [--alone] | down | meanwhile none|answered|gone | counts | still-waiting | other-kosk make|remove";

const rowsOf = (out) =>
  out
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l));
const koskId = () => {
  const id = seed().kosk;
  if (!UUID.test(id ?? ""))
    throw new Fail("graphs/.local/seed.json has no kosk");
  return id;
};
const madrasahId = () => {
  const id = seed().madrasah;
  if (!UUID.test(id ?? ""))
    throw new Fail("graphs/.local/seed.json has no madrasah");
  return id;
};
const madeFile = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    throw new Fail(
      `${FILE} does not exist: run requests.mjs up first, in this walk's setup`
    );
  }
};
const idOf = (made, which) => {
  const id = made[which]?.id;
  if (!UUID.test(id ?? ""))
    throw new Fail(`the made file holds no ${which} request`);
  return id;
};

/** The helpers' own course maker, run as the shell would (its output is one line of JSON). */
const course = (...args) =>
  exec("node", ["helpers/course.mjs", ...args], {
    cwd: resolve(LOCAL, "../bindings"),
  });

async function removeOwn() {
  const k = koskId();
  // a course the Ders aç form made from one of the requests carries the request's title
  const courses = rowsOf(
    await query(
      `select id from courses where kosk_id = '${k}' and title like '${PREFIX}%'`
    )
  );
  for (const c of courses) {
    if (!UUID.test(c.id)) throw new Fail(`not a uuid: ${c.id}`);
    await must("SYSTEM_ADMIN", "DELETE", `/courses/${c.id}`, undefined, [404]);
  }
  // the course of --accepted: course.mjs says `none` when there is nothing to remove
  await course("remove", ACCEPTED_COURSE_TAG);
  const requests = rowsOf(
    await query(
      `delete from course_requests where kosk_id = '${k}' and title like '${PREFIX}%' returning id`
    )
  );
  rmSync(FILE, { force: true });
  return { requests: requests.length, courses: courses.length };
}

async function foreign() {
  const n = rowsOf(
    await query(
      `select count(*) as n from course_requests where kosk_id = '${koskId()}' and title not like '${PREFIX}%'`
    )
  )[0]?.n;
  return Number(n ?? 0);
}

async function otherKosk(verb) {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${OTHER_HANDLE}&limit=50`
    )
  ).body;
  const same = (found.items ?? []).filter(
    (x) => (x.handle ?? "").replace(/^@/, "").toLowerCase() === OTHER_HANDLE
  );
  for (const x of same) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${x.id}`);
  if (verb === "remove") {
    console.log("other-kosk removed");
    return;
  }
  // an account tedrisat has never seen is refused as a nazım: its first GET /me writes its row
  await must("applicantH", "GET", "/me");
  await must("SYSTEM_ADMIN", "POST", "/kosks", {
    name: "Talep Başka Köşkü",
    handle: OTHER_HANDLE,
    managerUserIds: [subOf("applicantH")],
  });
  console.log("other-kosk ready");
}

run("requests", async () => {
  const o = options(process.argv.slice(2), {
    values: ["waiting", "rejected", "accepted"],
    flags: ["alone"],
  });
  const [verb, what, ...more] = o.rest;
  if (more.length || !verb) throw new Fail(usage, 2);

  if (verb === "up") {
    if (what) throw new Fail(usage, 2);
    const waiting = Number(o.waiting ?? 0);
    const rejected = Number(o.rejected ?? 0);
    const accepted = Number(o.accepted ?? 0);
    if (
      ![waiting, rejected, accepted].every(Number.isInteger) ||
      waiting < 0 ||
      waiting > 2 ||
      rejected < 0 ||
      rejected > 1 ||
      accepted < 0 ||
      accepted > 1
    )
      throw new Fail(
        "--waiting is 0 to 2, --rejected and --accepted 0 or 1",
        2
      );
    await removeOwn();
    if (o.alone) {
      const n = await foreign();
      if (n > 0)
        throw new Fail(
          `the köşk holds ${n} course request(s) that are not this walk's; this walk presses Reddet on its first row and expects the counts to be its own`
        );
    }
    const s = seed();
    const make = async (letter, on) => {
      const title = `${PREFIX}${letter}`;
      if (!on) return { id: null, title };
      const sent = await must(
        "basmuderris",
        "POST",
        `/madrasahs/${madrasahId()}/offsite-course-requests`,
        { koskId: koskId(), title, reason: REASON }
      );
      const id = sent.body?.id;
      if (!UUID.test(id ?? ""))
        throw new Fail("the request was made but gave no id");
      return { id, title };
    };
    const first = await make("A", waiting >= 1);
    const second = await make("B", waiting >= 2);
    const refused = await make("C", rejected >= 1);
    if (refused.id)
      await must(
        "KOSK_NAZIM",
        "POST",
        `/course-requests/${refused.id}/reject`,
        {
          reason: EARLIER_REASON,
        }
      );
    const accept = await make("D", accepted >= 1);
    if (accept.id) {
      const { stdout } = await course(
        "make",
        ACCEPTED_COURSE_TAG,
        "--kosk",
        koskId(),
        "--weeks",
        "1",
        "--lessons",
        "1"
      );
      const courseId = JSON.parse(stdout.trim().split("\n").pop()).course;
      await must("KOSK_NAZIM", "POST", `/course-requests/${accept.id}/accept`, {
        courseId,
      });
    }
    // the words the page shows, as the köşk's nazım's own read gives them (the sender's name is the API's: name, else e-mail)
    const read = async (status) =>
      (
        await must(
          "KOSK_NAZIM",
          "GET",
          `/kosks/${koskId()}/course-requests?status=${status}`
        )
      ).body.items ?? [];
    const mine = [...(await read("PENDING")), ...(await read("DECIDED"))].find(
      (r) => r.title.startsWith(PREFIX)
    );
    mkdirSync(resolve(LOCAL, "made"), { recursive: true });
    writeFileSync(
      FILE,
      `${JSON.stringify({
        tag: TAG,
        kosk: mine?.kosk?.name ?? s.titles.kosk,
        madrasah: mine?.madrasah?.name ?? s.titles.madrasah,
        sender: mine?.requestedBy?.name ?? "Adı bilinmeyen üye",
        reason: REASON,
        rejectReason: REJECT_REASON,
        waiting,
        first,
        second,
        rejected: refused,
        accepted: accept,
      })}\n`,
      { mode: 0o600 }
    );
    console.log(
      `ready: ${waiting} waiting, ${rejected} rejected, ${accepted} accepted`
    );
    return;
  }

  if (verb === "down") {
    if (what) throw new Fail(usage, 2);
    const r = await removeOwn();
    console.log(`restored: ${r.requests} request(s), ${r.courses} course(s)`);
    return;
  }

  if (verb === "meanwhile") {
    if (what === "none") console.log("meanwhile none");
    else if (what === "answered") {
      const id = idOf(madeFile(), "first");
      const r = await call(
        "KOSK_NAZIM",
        "POST",
        `/course-requests/${id}/reject`,
        {
          reason: ELSEWHERE_REASON,
        }
      );
      if (r.status !== 204 && r.status !== 409)
        throw new Fail(`the refusal was refused: HTTP ${r.status}`);
      console.log("meanwhile answered");
    } else if (what === "gone") {
      const id = idOf(madeFile(), "first");
      await query(`delete from course_requests where id = '${id}'`);
      console.log("meanwhile gone");
    } else throw new Fail(usage, 2);
    return;
  }

  if (verb === "counts") {
    if (what) throw new Fail(usage, 2);
    const api = (
      await must(
        "KOSK_NAZIM",
        "GET",
        `/kosks/${koskId()}/course-requests?status=PENDING`
      )
    ).body;
    const db = rowsOf(
      await query(
        `select count(*) filter (where status = 'PENDING') as pending, count(*) filter (where status <> 'PENDING') as decided from course_requests where kosk_id = '${koskId()}'`
      )
    )[0];
    if (
      Number(db.pending) !== api.pendingCount ||
      Number(db.decided) !== api.decidedCount
    )
      throw new Fail(
        `the API counts ${api.pendingCount} waiting and ${api.decidedCount} answered, the database ${db.pending} and ${db.decided}`
      );
    console.log(
      `counts ok pending=${api.pendingCount} decided=${api.decidedCount}`
    );
    return;
  }

  if (verb === "still-waiting") {
    if (what) throw new Fail(usage, 2);
    const made = madeFile();
    const n = Number(
      rowsOf(
        await query(
          `select count(*) as n from course_requests where kosk_id = '${koskId()}' and status = 'PENDING' and title like '${PREFIX}%'`
        )
      )[0]?.n ?? 0
    );
    if (n !== made.waiting)
      throw new Fail(
        `${n} of this walk's requests wait, ${made.waiting} were left waiting`
      );
    console.log(`still-waiting ${n}`);
    return;
  }

  if (verb === "other-kosk") {
    if (what !== "make" && what !== "remove") throw new Fail(usage, 2);
    await otherKosk(what);
    return;
  }

  throw new Fail(usage, 2);
});
