// What nazar.evaluation.markRecited's walk checks of the API after a press, and no shared helper does: the talebe's OWN read of a mark, waited for.
//
//   node ../nazar/evaluation/markRecited/recited.mjs wait <lessonId> <ACCOUNT> <FULL|INCOMPLETE|ABSENT|none|any> [--note <text>] [--within <seconds>]
//
// A press on the board is drawn at once and saved a moment later (the page's own queue, evaluation-board.tsx:55-97), so a check made at the instant
// the walk takes the transition may come before the PUT: this one asks again, once a second, until the talebe's read (GET /lessons/:id/evaluation,
// the one the celse page makes) gives the status, and the note when one is given, or until --within seconds (15 by default) have passed.
// `none` is "Bekliyor" (status null); `any` is any of the three marks (for a check of the note alone). It is the check evaluation#1 makes in a14 and
// a15, and, as the talebe reads it, what a8, a10 and a13 read from the database. Prints `mark <STATUS> <note>` (the note after a space, or `-`
// when there is none) and exits 0; exits 1 with what the last read said when it never matched. Only the API is used; nothing is written; nothing
// secret is printed.
import {
  accountKey,
  call,
  Fail,
  options,
  refusal,
  run,
} from "../../../bindings/helpers/lib.mjs";

const usage =
  "usage: recited.mjs wait <lessonId> <ACCOUNT> <FULL|INCOMPLETE|ABSENT|none|any> [--note <text>] [--within <seconds>]";
const WANT = ["FULL", "INCOMPLETE", "ABSENT", "none", "any"];

run("recited", async () => {
  const { rest, note, within } = options(process.argv.slice(2), {
    values: ["note", "within"],
  });
  const [verb, lesson, account, want, ...more] = rest;
  if (verb !== "wait" || !lesson || !account || !want || more.length)
    throw new Fail(usage, 2);
  if (!WANT.includes(want)) throw new Fail(`${want} is not one of ${WANT}`, 2);
  const seconds = within === undefined ? 15 : Number(within);
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Fail("--within is a number of seconds", 2);
  accountKey(account);

  const deadline = Date.now() + seconds * 1000;
  let last;
  for (;;) {
    const r = await call(account, "GET", `/lessons/${lesson}/evaluation`);
    if (r.status === 200) {
      const status = r.body?.status ?? null;
      const kept = r.body?.note ?? null;
      const statusOk =
        want === "any"
          ? status !== null
          : want === "none"
            ? status === null
            : status === want;
      const noteOk = note === undefined || kept === note;
      if (statusOk && noteOk) {
        console.log(`mark ${status ?? "none"} ${kept ?? "-"}`);
        return;
      }
      last = `status ${status ?? "none"}, note ${kept ?? "-"}`;
    } else {
      last = refusal(r);
    }
    if (Date.now() >= deadline)
      throw new Fail(
        `the talebe's read never gave ${want}${note === undefined ? "" : ` with the note`}: last, ${last}`
      );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
});
