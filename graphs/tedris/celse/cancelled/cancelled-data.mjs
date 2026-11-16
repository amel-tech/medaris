// Makes what tedris.celse.cancelled needs and the seed has not got, and takes it away again (the flow's setup and teardown): a
// published course of its own in the second köşk with celses the hoca has cancelled, and the walk's talebe holding a seat in it.
//
//   node ../tedris/celse/cancelled/cancelled-data.mjs make     the course, its celses, the cancellations and the talebe's seat
//   node ../tedris/celse/cancelled/cancelled-data.mjs remove   the course and everything under it is deleted
//   node ../tedris/celse/cancelled/cancelled-data.mjs probe    what tedrisat tells the talebe about each celse (evidence for the findings)
// Run by hand, it changes data: run it under the replay lock, as a replay does.
//
// Why a course of its own. The seeded courses are other flows' data and change under a walk, and none has a cancelled celse. The
// course lives in the second köşk, "Kubbealtı Köşkü", and its title is the only thing `make` and `remove` look it up by.
//
// What it uses (all of it through tedrisat's HTTP API, no SQL): the köşk's nazım makes the course and names the `muderris` account
// as its hoca (POST /kosks/{id}/courses). The talebe takes the seat first, the way a person does (POST /courses/{id}/enroll, the
// course takes anyone), so that the cancels are told to them (the SESSION_CANCELLED notification). Then that hoca cancels four
// celses as the app's own Nazar does (POST /lessons/{id}/cancel, `cancelLesson`): one with a note and a make-up, one with neither,
// one that is a VIDEO lesson, which the route cancels as well (the domain's finding cancel-no-type-check), and one that held a
// recording (a pasted link) before it was cancelled. The başnazım deletes the course. `make` first deletes a course of that title,
// so a walk that crashed leaves nothing in the way. Nothing the seed holds is touched.
// The ids are written to graphs/.local/cancelled-celse.json, which the binding reads as {cancelled.*}. `make` and `remove` are
// idempotent. Nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  call,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TITLE = "İptal edilen celse denemesi";
const FILE = resolve(LOCAL, "cancelled-celse.json");
const TALEBE = "applicantF";
const DAY = 86_400_000;
const NOTE = "Hoca yolda kaldı. Bu haftanın okuması cumartesiye alındı.";
const MEETING = "https://meet.example.test/iptal-denemesi";

// An instant `days` from now at 18:00 UTC (21:00 in Istanbul), the hour the seed's own celses have.
const at = (days) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
};

const idsOf = async () => {
  const out = await query(
    `select id from courses where title = '${TITLE}' and kosk_id = '${seed().kosk2}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

const remove = async () => {
  const ids = await idsOf();
  for (const id of ids)
    await must("systemAdmin", "DELETE", `/courses/${id}`, undefined, [404]);
  return ids.length;
};

const make = async () => {
  await remove();
  const live = (title, days, extra = {}) => ({
    title,
    type: "LIVE",
    durationMinutes: 60,
    scheduledAt: at(days),
    meetingUrl: MEETING,
    ...extra,
  });
  const created = (
    await must("koskNazim", "POST", `/kosks/${seed().kosk2}/courses`, {
      title: TITLE,
      description:
        "İptal edilen bir celsenin sayfasını görmek için yazılmış deneme dersi.",
      status: "PUBLISHED",
      requiresApproval: false,
      muderris: [{ userId: subOf("muderris"), name: await nameOf("muderris") }],
      weeks: [
        {
          weekNumber: 1,
          title: "Giriş",
          lessons: [
            live("Birinci okuma", -7),
            live("Kayıtlı iptal edilen okuma", -6),
          ],
        },
        {
          weekNumber: 2,
          title: "Okuma",
          lessons: [
            live("İptal edilen okuma", 2),
            live("Telafisiz iptal edilen okuma", 3),
            live("Telafi okuması", 5),
            { title: "İptal edilen video", type: "VIDEO", durationMinutes: 20 },
          ],
        },
      ],
    })
  ).body;
  const course = async () =>
    (await must("koskNazim", "GET", `/courses/${created.id}`)).body;
  const byTitle = (c, t) =>
    c.weeks.flatMap((w) => w.lessons).find((l) => l.title === t);
  const first = await course();
  const cancelled = byTitle(first, "İptal edilen okuma");
  const bare = byTitle(first, "Telafisiz iptal edilen okuma");
  const makeUp = byTitle(first, "Telafi okuması");
  const video = byTitle(first, "İptal edilen video");
  const recorded = byTitle(first, "Kayıtlı iptal edilen okuma");

  // the talebe's seat comes first, so that the cancellations are told to them as a person is told (the SESSION_CANCELLED notification,
  // which goes to the enrolled seats at the moment of the cancel)
  await must(TALEBE, "POST", `/courses/${created.id}/enroll`);

  // each cancel bumps the course's version, which the next one must carry
  await must("muderris", "POST", `/lessons/${cancelled.id}/cancel`, {
    version: first.version,
    reason: NOTE,
    replacementLessonId: makeUp.id,
  });
  await must("muderris", "POST", `/lessons/${bare.id}/cancel`, {
    version: (await course()).version,
  });
  await must("muderris", "POST", `/lessons/${video.id}/cancel`, {
    version: (await course()).version,
  });
  // a celse that held a recording (a pasted link, READY at once) before it was cancelled: what the page does with it
  await must("muderris", "POST", `/lessons/${recorded.id}/recordings`, {
    title: "Kayıt",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  await must("muderris", "POST", `/lessons/${recorded.id}/cancel`, {
    version: (await course()).version,
    reason: "Kayıt var, celse iptal.",
  });

  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({
      course: created.id,
      title: TITLE,
      kosk: seed().kosk2,
      cancelled: cancelled.id,
      cancelledTitle: cancelled.title,
      bare: bare.id,
      bareTitle: bare.title,
      makeUp: makeUp.id,
      makeUpTitle: makeUp.title,
      video: video.id,
      recorded: recorded.id,
      note: NOTE,
      meeting: MEETING,
    })}\n`,
    { mode: 0o600 }
  );
  return created.id;
};

// What the page's reads answer to the walk's talebe for each celse, in one line each: the evidence for the findings.
const probe = async () => {
  const [id] = await idsOf();
  if (!id) throw new Fail("no course: run make first");
  const ids = JSON.parse((await import("node:fs")).readFileSync(FILE, "utf8"));
  const lines = [];
  for (const [name, lesson] of [
    ["cancelled", ids.cancelled],
    ["bare", ids.bare],
    ["makeUp", ids.makeUp],
    ["video", ids.video],
    ["recorded", ids.recorded],
  ]) {
    const r = await call(TALEBE, "GET", `/courses/${id}/sessions/${lesson}`);
    const b = typeof r.body === "object" ? r.body : {};
    lines.push(
      `${name}: ${r.status} status=${b.status ?? "-"} meetingUrl=${"meetingUrl" in b ? JSON.stringify(b.meetingUrl) : "absent"} cancelReason=${"cancelReason" in b ? JSON.stringify(b.cancelReason) : "absent"} replacement=${b.replacement ? b.replacement.title : JSON.stringify(b.replacement ?? null)} ${r.status >= 400 ? (b.code ?? "") : ""}`
    );
  }
  // a recording cannot be added to a cancelled session: the sentence of the refusal
  const rec = await call(
    "muderris",
    "POST",
    `/lessons/${ids.cancelled}/recordings`,
    { title: "Deneme", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
  );
  lines.push(
    `recording on the cancelled celse: ${rec.status} ${rec.body?.code ?? ""} ${rec.body?.message ?? ""}`
  );
  return lines.join("\n");
};

run("cancelled-data", async () => {
  const [mode, ...more] = process.argv.slice(2);
  if (!["make", "remove", "probe"].includes(mode) || more.length)
    throw new Fail("usage: cancelled-data.mjs make | remove | probe", 2);
  const done =
    mode === "make"
      ? `course ${await make()} (${accountKey(TALEBE)} enrolled)`
      : mode === "probe"
        ? `\n${await probe()}`
        : `${await remove()} course(s) removed`;
  console.log(`cancelled-data ${mode} ${done}`);
});
