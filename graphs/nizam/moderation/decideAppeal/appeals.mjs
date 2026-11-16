// The walk data of nizam.moderation.decideAppeal, made and taken away through tedrisat's HTTP API: appeals of the seeded medrese, "Hadis ve Siyer
// Medresesi", against the seeded köşk's refusal of a course request, that the başnazım then reads on "İtirazlar". It is the binding's `setup`,
// `teardown` and the "meanwhile" a race walk needs: `node appeals.mjs up|down|meanwhile|counts|waits ...`, run with graphs/bindings/ as the working
// directory (../nizam/moderation/decideAppeal/appeals.mjs).
//
//   up [--waiting n] [--rejected n] [--accepted n] [--alone]
//        removes this walk's own requests first, then makes them, each the way the people themselves make one, through the routes the flows use:
//          1. the başmüderris sends the köşk a course request (POST /madrasahs/:id/offsite-course-requests: nazar.offsite.requestCourse),
//          2. the köşk's nazım refuses it with a reason (POST /course-requests/:id/reject: nizam.courseRequests.decide),
//          3. the başmüderris appeals the refusal (POST /madrasahs/:id/appeals: nazar.appeals.open).
//        `--waiting` of them stay waiting (at most 2: "A", then "B", so that A is the oldest and the page selects it); `--rejected` (at most 1,
//        "C") is refused by the başnazım with an earlier note, so that the Karara bağlanan tab holds one; `--accepted` (at most 1, "D") is
//        accepted by the başnazım, which sends its request back to the köşk as a waiting one. C and D are decided here, in setup, and they are
//        this walk's own: the walk never decides an appeal it did not make. --alone fails, naming the count, when the platform holds any appeal that
//        is not this walk's: the page lists every appeal of every medrese, oldest first and the oldest is selected on load, so a walk that
//        presses Kabul et or Reddet must be sure the first row is its own, and the empty and counts walks need a platform with no other appeal.
//        Prints `ready: <w> waiting, <r> rejected, <a> accepted` and writes graphs/.local/made/appeals-decide.json ({ kosk, madrasah,
//        requestReason, rejectReason, appealReason, note, waiting, first, second, rejected, accepted }, each appeal { id, appeal, title }: `id`
//        is the course request's, `appeal` the appeal's; both are null where that appeal was not made, the words are written all the same),
//        which the binding reads as the data source `made`.
//   down  removes this walk's own requests (the appeal of each goes by cascade) and every course whose title is a request's (none is ever made
//        by an appeal: "Kabul et" only sends the request back, and the köşk's nazım would make the course through the Ders aç form, which this
//        walk never opens; the sweep is for a walk that died), and the made file. Safe to run twice. Prints `restored: <r> request(s), <c> course(s)`.
//   meanwhile none|answered|gone
//        what happens elsewhere while the dialog is open: `answered` (the başnazım refuses the first appeal in another tab with another note: the
//        page's own decision then meets APPEAL_NOT_PENDING); `gone` (the first appeal's request is deleted, the appeal with it: APPEAL_NOT_FOUND).
//        Both are safe to run twice. Prints `meanwhile <mode>`.
//   counts   reads the tab counts as the başnazım does (GET /appeals) and checks them against the database's own count of the appeals, waiting
//        and decided. Prints `counts ok pending=<n> decided=<n>`, or `counts skipped 429` where the walk holds that route's budget on purpose.
//   waits <n>   checks that the köşk's nazım finds at least <n> of this walk's requests waiting in the köşk's own list (GET /kosks/:id/
//        course-requests?status=PENDING), which is what "Kabul et" leaves: the request is back with the köşk. Prints `waits <found>`.
//
// The one SQL it uses is the removal of requests (no route deletes one: the appeal of a request goes with it by cascade, the audit rows stay
// and nothing can remove them), the removal of `meanwhile gone`, the two counts and the foreign check. Every id put into SQL is checked to be a
// uuid. What it cannot undo: the audit rows (course_request.create and .reject, appeal.create, appeal.accept and .reject). Run it under the
// replay lock when walks are running and you run it by hand.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  call,
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "appeals-decide";
const PREFIX = "Deneme dersi appeals-decide ";
const FILE = resolve(LOCAL, "made", `${TAG}.json`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_REASON =
  "Medresemizin talebeleri için bir siyer okumasının köşkte açılmasını istiyoruz.";
const REJECT_REASON = "Bu dönem programımızda yer yok.";
const APPEAL_REASON =
  "Dersin hocası ve programı hazır; köşkün gerekçesini yeniden değerlendirmenizi rica ederiz.";
const NOTE = "Köşkün gerekçesi yerinde, talep reddedilmiş kalıyor."; // what the walk types in the dialog
const EARLIER_NOTE = "Önceki dönemde reddedildi.";
const ELSEWHERE_NOTE = "Başka bir karar aynı anda verildi.";

const usage =
  "usage: appeals.mjs up [--waiting n] [--rejected n] [--accepted n] [--alone] | down | meanwhile none|answered|gone | counts | waits <n>";

const rowsOf = (out) =>
  out
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l));
const uuidOf = (id, what) => {
  if (!UUID.test(id ?? ""))
    throw new Fail(`graphs/.local/seed.json has no ${what}`);
  return id;
};
const koskId = () => uuidOf(seed().kosk, "kosk");
const madrasahId = () => uuidOf(seed().madrasah, "madrasah");
const madeFile = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    throw new Fail(
      `${FILE} does not exist: run appeals.mjs up first, in this walk's setup`
    );
  }
};
const firstOf = (made) => {
  const first = made.first ?? {};
  if (!UUID.test(first.id ?? "") || !UUID.test(first.appeal ?? ""))
    throw new Fail("the made file holds no first appeal");
  return first;
};

async function removeOwn() {
  const k = koskId();
  // a course the Ders aç form made from one of the requests would carry the request's title; no step of this walk makes one
  const courses = rowsOf(
    await query(
      `select id from courses where kosk_id = '${k}' and title like '${PREFIX}%'`
    )
  );
  for (const c of courses) {
    if (!UUID.test(c.id)) throw new Fail(`not a uuid: ${c.id}`);
    await must("SYSTEM_ADMIN", "DELETE", `/courses/${c.id}`, undefined, [404]);
  }
  const requests = rowsOf(
    await query(
      `delete from course_requests where kosk_id = '${k}' and title like '${PREFIX}%' returning id`
    )
  );
  rmSync(FILE, { force: true });
  return { requests: requests.length, courses: courses.length };
}

/** How many appeals the platform holds that are not this walk's. */
async function foreign() {
  const n = rowsOf(
    await query(
      `select count(*) as n from appeals a join course_requests r on r.id = a.course_request_id where r.title not like '${PREFIX}%'`
    )
  )[0]?.n;
  return Number(n ?? 0);
}

/** A request of the medrese to the köşk, refused by the köşk's nazım, appealed by the başmüderris: { id, appeal, title }. */
async function makeAppeal(letter) {
  const title = `${PREFIX}${letter}`;
  const sent = await must(
    "basmuderris",
    "POST",
    `/madrasahs/${madrasahId()}/offsite-course-requests`,
    { koskId: koskId(), title, reason: REQUEST_REASON }
  );
  const id = sent.body?.id;
  if (!UUID.test(id ?? ""))
    throw new Fail("the request was made but gave no id");
  await must("KOSK_NAZIM", "POST", `/course-requests/${id}/reject`, {
    reason: REJECT_REASON,
  });
  const appealed = await must(
    "basmuderris",
    "POST",
    `/madrasahs/${madrasahId()}/appeals`,
    { courseRequestId: id, reason: APPEAL_REASON }
  );
  const appeal = appealed.body?.id;
  if (!UUID.test(appeal ?? ""))
    throw new Fail("the appeal was made but gave no id");
  return { id, appeal, title };
}

run("appeals", async () => {
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
          `the platform holds ${n} appeal(s) that are not this walk's; this walk decides the first row of the list and expects the counts to be its own`
        );
    }
    const s = seed();
    const none = { id: null, appeal: null };
    // the decided ones first, then the waiting ones in order, so that A is the oldest waiting appeal
    let refused = { ...none, title: `${PREFIX}C` };
    if (rejected >= 1) {
      refused = await makeAppeal("C");
      await must("SYSTEM_ADMIN", "POST", `/appeals/${refused.appeal}/reject`, {
        note: EARLIER_NOTE,
      });
    }
    let accept = { ...none, title: `${PREFIX}D` };
    if (accepted >= 1) {
      accept = await makeAppeal("D");
      await must("SYSTEM_ADMIN", "POST", `/appeals/${accept.appeal}/accept`);
    }
    const first =
      waiting >= 1 ? await makeAppeal("A") : { ...none, title: `${PREFIX}A` };
    const second =
      waiting >= 2 ? await makeAppeal("B") : { ...none, title: `${PREFIX}B` };
    mkdirSync(resolve(LOCAL, "made"), { recursive: true });
    writeFileSync(
      FILE,
      `${JSON.stringify({
        tag: TAG,
        kosk: s.titles.kosk,
        madrasah: s.titles.madrasah,
        requestReason: REQUEST_REASON,
        rejectReason: REJECT_REASON,
        appealReason: APPEAL_REASON,
        note: NOTE,
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
      const { appeal } = firstOf(madeFile());
      const r = await call(
        "SYSTEM_ADMIN",
        "POST",
        `/appeals/${appeal}/reject`,
        {
          note: ELSEWHERE_NOTE,
        }
      );
      if (r.status !== 204 && r.status !== 409)
        throw new Fail(`the refusal was refused: HTTP ${r.status}`);
      console.log("meanwhile answered");
    } else if (what === "gone") {
      const { id } = firstOf(madeFile());
      await query(`delete from course_requests where id = '${id}'`);
      console.log("meanwhile gone");
    } else throw new Fail(usage, 2);
    return;
  }

  if (verb === "counts") {
    if (what) throw new Fail(usage, 2);
    const read = await call("SYSTEM_ADMIN", "GET", "/appeals?status=PENDING");
    if (read.status === 429) {
      // the `unreadable` walk spends this route's budget on purpose (nazar/shell/errorStates/throttle.mjs): nothing to compare then
      console.log("counts skipped 429");
      return;
    }
    if (read.status < 200 || read.status >= 300)
      throw new Fail(`GET /appeals answers HTTP ${read.status}`);
    const api = read.body;
    const db = rowsOf(
      await query(
        "select count(*) filter (where status = 'PENDING') as pending, count(*) filter (where status <> 'PENDING') as decided from appeals"
      )
    )[0];
    if (
      Number(db.pending) !== api.pendingCount ||
      Number(db.decided) !== api.decidedCount
    )
      throw new Fail(
        `the API counts ${api.pendingCount} waiting and ${api.decidedCount} decided, the database ${db.pending} and ${db.decided}`
      );
    console.log(
      `counts ok pending=${api.pendingCount} decided=${api.decidedCount}`
    );
    return;
  }

  if (verb === "waits") {
    const wanted = Number(what);
    if (!Number.isInteger(wanted) || wanted < 0) throw new Fail(usage, 2);
    const list = (
      await must(
        "KOSK_NAZIM",
        "GET",
        `/kosks/${koskId()}/course-requests?status=PENDING`
      )
    ).body;
    const found = (list.items ?? []).filter((r) =>
      String(r.title ?? "").startsWith(PREFIX)
    ).length;
    if (found < wanted)
      throw new Fail(
        `the köşk's nazım finds ${found} of this walk's requests waiting, ${wanted} were expected`
      );
    console.log(`waits ${found}`);
    return;
  }

  throw new Fail(usage, 2);
});
