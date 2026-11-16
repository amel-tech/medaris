// The walk data of nazar.appeals.open, made and taken away through tedrisat's HTTP API: one course request of the seeded medrese that
// the seeded köşk's nazım refused, so that İtirazlar lists it with "İtiraz aç". It is the binding's `setup`, `teardown` and the
// "meanwhile" a refusal walk needs: `node requests.mjs up|down|meanwhile|nazir ...`, run with graphs/bindings/ as the working
// directory (../nazar/appeals/open/requests.mjs).
//
//   up   [--none] [--alone]   removes this walk's own request, then (unless --none) the başmüderris sends a request to the seed's köşk
//                             (POST /madrasahs/:id/offsite-course-requests) and the köşk's nazım refuses it with a reason
//                             (POST /course-requests/:id/reject). --alone fails when the medrese holds any other refused request or
//                             any appeal (a walk that expects the empty line, or the list to be empty again after a race, needs that).
//                             Prints `ready: <title> REJECTED` (or `ready: none`) and writes graphs/.local/made/appeals-open.json
//                             ({ title, kosk, rejectReason, id }; id is null with --none), which the binding reads as the data source
//                             `made`, so that {made.title} reads in every scenario.
//   down                      removes this walk's own request (and its appeal, which goes with it) and the made file; prints `restored: <n> removed`.
//   meanwhile <mode>          what happens elsewhere while the dialog is open (a refusal walk): `none`; `appeal` (the başmüderris
//                             appeals the same request in another tab); `unreject` (the request is no longer refused); `delete` (the
//                             request is gone); `revoke` (the nazır's grant of madrasah.appeal_open is taken back). Every mode is
//                             safe to run twice. Prints `meanwhile <mode>`.
//   nazir grant|revoke        the başmüderris gives the seed's medrese nazır madrasah.appeal_open, or takes every permission back
//                             (PUT /madrasahs/:id/nazirs/:userId/permissions, which replaces what the nazır held; the seed gives none).
//
// SQL is used for two things no route does: removing a course request (no route deletes one; the appeal goes with it by cascade, and
// the audit rows stay: nothing can remove them) and the two `meanwhile` modes that undo the köşk's decision (no route un-refuses a
// request; an accepted appeal would, but it needs the appeal this mode must not have). Every id put into SQL is checked to be a uuid.
// Run it under the replay lock when walks are running and you run it by hand.
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
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "appeals-open";
const TITLE = `Deneme dersi ${TAG}`;
const REQUEST_REASON =
  "Medresemizin talebeleri için bir hadis okumasının köşkte açılmasını istiyoruz.";
const REJECT_REASON = "Bu dönem programımızda yer yok.";
const APPEAL_REASON =
  "Dersin hocası ve programı hazır; köşkün gerekçesini yeniden değerlendirmenizi rica ederiz.";
const FILE = resolve(LOCAL, "made", `${TAG}.json`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const usage =
  "usage: requests.mjs up [--none] [--alone] | down | meanwhile none|appeal|unreject|delete|revoke | nazir grant|revoke";

const rowsOf = (out) => out.split("\n").filter((l) => l.trim().startsWith("{"));
const madeFile = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    throw new Fail(
      `${FILE} does not exist: run requests.mjs up first, in this walk's setup`
    );
  }
};
const requestId = () => {
  const { id } = madeFile();
  if (!UUID.test(id ?? "")) throw new Fail(`${FILE} holds no request id`);
  return id;
};
const madrasahId = () => {
  const id = seed().madrasah;
  if (!UUID.test(id ?? ""))
    throw new Fail("graphs/.local/seed.json has no madrasah");
  return id;
};

/** Removes every course request of the medrese that has this walk's title; the appeal of each goes with it. */
async function removeOwn() {
  const out = await query(
    `delete from course_requests where madrasah_id = '${madrasahId()}' and title = '${TITLE}' returning id`
  );
  rmSync(FILE, { force: true });
  return rowsOf(out).length;
}

/** How many refused requests or appeals the medrese holds that are not this walk's. */
async function foreignRows() {
  const out = await query(
    `select count(*) as count from course_requests c where c.madrasah_id = '${madrasahId()}' and c.title <> '${TITLE}'
       and (c.status = 'REJECTED' or exists (select 1 from appeals a where a.course_request_id = c.id))`
  );
  return Number(JSON.parse(rowsOf(out)[0] ?? '{"count":0}').count);
}

async function nazirPermissions(codes) {
  await must(
    "basmuderris",
    "PUT",
    `/madrasahs/${madrasahId()}/nazirs/${subOf("MEDRESE_NAZIR")}/permissions`,
    { permissions: codes }
  );
}

run("requests", async () => {
  const { rest, none, alone } = options(process.argv.slice(2), {
    flags: ["none", "alone"],
  });
  const [verb, what, ...more] = rest;
  if (more.length || !verb) throw new Fail(usage, 2);

  if (verb === "up") {
    if (what) throw new Fail(usage, 2);
    await removeOwn();
    if (alone) {
      const n = await foreignRows();
      if (n > 0)
        throw new Fail(
          `the medrese holds ${n} refused or appealed course request(s) that are not this walk's; this walk expects the list to be empty without its own`
        );
    }
    const s = seed();
    mkdirSync(resolve(LOCAL, "made"), { recursive: true });
    const made = (id) =>
      writeFileSync(
        FILE,
        JSON.stringify({
          tag: TAG,
          title: TITLE,
          kosk: s.titles.kosk,
          rejectReason: REJECT_REASON,
          id,
        })
      );
    if (none) {
      made(null); // the words are written all the same, so a binding can read {made.title} where no request exists
      console.log("ready: none");
      return;
    }
    const sent = await must(
      "basmuderris",
      "POST",
      `/madrasahs/${madrasahId()}/offsite-course-requests`,
      { koskId: s.kosk, title: TITLE, reason: REQUEST_REASON }
    );
    const id = sent.body?.id;
    if (!UUID.test(id ?? ""))
      throw new Fail("the request was made but gave no id");
    await must("KOSK_NAZIM", "POST", `/course-requests/${id}/reject`, {
      reason: REJECT_REASON,
    });
    made(id);
    console.log(`ready: ${TITLE} REJECTED`);
    return;
  }

  if (verb === "down") {
    if (what) throw new Fail(usage, 2);
    console.log(`restored: ${await removeOwn()} removed`);
    return;
  }

  if (verb === "meanwhile") {
    if (what === "none") {
      console.log("meanwhile none");
    } else if (what === "appeal") {
      const r = await call(
        "basmuderris",
        "POST",
        `/madrasahs/${madrasahId()}/appeals`,
        {
          courseRequestId: requestId(),
          reason: APPEAL_REASON,
        }
      );
      if (r.status !== 201 && r.status !== 409)
        throw new Fail(`the appeal was refused: HTTP ${r.status}`);
      console.log("meanwhile appeal");
    } else if (what === "unreject") {
      await query(
        `update course_requests set status = 'PENDING', decided_by = null, decided_at = null where id = '${requestId()}'`
      );
      console.log("meanwhile unreject");
    } else if (what === "delete") {
      await query(`delete from course_requests where id = '${requestId()}'`);
      console.log("meanwhile delete");
    } else if (what === "revoke") {
      await nazirPermissions([]);
      console.log("meanwhile revoke");
    } else throw new Fail(usage, 2);
    return;
  }

  if (verb === "nazir") {
    if (what === "grant") await nazirPermissions(["madrasah.appeal_open"]);
    else if (what === "revoke") await nazirPermissions([]);
    else throw new Fail(usage, 2);
    console.log(`nazir ${what}`);
    return;
  }

  throw new Fail(usage, 2);
});
