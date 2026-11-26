// Reads what the başnazım's home is about to show, and writes it where the binding reads it. Read only: it makes one
// GET /nizam/dashboard as the başnazım (the same call the page's server side makes) and changes nothing on the stack.
//
//   node ../nizam/home/chiefOverview/home-numbers.mjs read             the numbers and the newest rows, written to graphs/.local/chief-home.json
//   node ../nizam/home/chiefOverview/home-numbers.mjs read empty       the same, and fails unless the seed's own state holds (nothing waits,
//                                                                      nothing is passive, no ban is open, every köşk is listed)
//   node ../nizam/home/chiefOverview/home-numbers.mjs read rows        the same, and fails unless every card has a row, a medrese has no head
//                                                                      and no course has none (the scenario `rows` of binding.yaml)
//   node ../nizam/home/chiefOverview/home-numbers.mjs read queues      the same, and fails unless the three queues have a row and nothing is
//                                                                      passive (the scenario `queues`: the home with no warning and rows to open)
//
// Why a file. The page's numbers (köşks, medreses, courses, enrolled talebe) and the sentence "Karar bekleyen N talep var." depend on
// what the other flows leave in the database, so a walk reads the expected value from the API's own answer, taken just before it opens
// the page, and compares the page with it. The walks run one at a time under the replay lock, so nothing changes in between. The
// API's answer is what the page is made from; it is not the database (e2e dashboard#1 assertions 6-9 compare with SQL counts, which
// this does not).
//
// The data this flow cannot make: a pending köşk application, a pending deck publish request, a medrese with no başmüderris, an open
// ban and an unlisted köşk. The owner's word for this phase is not to create data to make a count, so `rows` fails with the missing
// piece named instead of making it. Prints `chief-home <mode> <what was read>`; nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  call,
  Fail,
  LOCAL,
  refusal,
  run,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "chief-home.json");

run("home-numbers", async () => {
  const [verb, mode] = process.argv.slice(2);
  if (
    verb !== "read" ||
    (mode !== undefined && !["empty", "rows", "queues"].includes(mode))
  )
    throw new Fail("usage: home-numbers.mjs read [empty|rows|queues]", 2);

  const r = await call("systemAdmin", "GET", "/nizam/dashboard");
  if (r.status !== 200)
    throw new Fail(`GET /nizam/dashboard as the başnazım: ${refusal(r)}`);
  const d = r.body;
  const totals = d.pendingTotals;
  // the sum the page adds up (features/dashboard/present.ts:29-36): a null adds nothing
  const pending = [
    totals.koskApplications,
    totals.deckPublishRequests,
    totals.appeals,
    totals.permanentBanRequests,
  ].reduce((sum, n) => sum + (n ?? 0), 0);
  const counts = d.platformCounts;
  const out = {
    name: d.greetingName ?? "",
    pending,
    appeals: totals.appeals ?? 0,
    kosk: counts.kosk,
    unlisted: counts.unlistedKosk,
    madrasah: counts.madrasah,
    inactiveMadrasah: counts.inactiveMadrasah,
    course: counts.course,
    inactiveCourse: counts.inactiveCourse,
    students: counts.enrolledStudents,
    applications: d.latestApplications?.length ?? 0,
    decks: d.latestDeckRequests?.length ?? 0,
    passiveShown: d.inactiveScopes?.length ?? 0,
    passiveCount: d.inactiveScopeCount ?? 0,
    bans: d.latestBans?.length ?? 0,
    firstApplication: d.latestApplications?.[0]?.name ?? "",
    firstDeck: d.latestDeckRequests?.[0]?.title ?? "",
    firstPassive: d.inactiveScopes?.[0]?.name ?? "",
    firstBan: d.latestBans?.[0]?.userName ?? "",
  };
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(out, null, 2)}\n`);

  const lacking = [];
  if (mode !== undefined && out.unlisted !== 0)
    lacking.push(`${out.unlisted} unlisted köşk(s)`);
  if (mode === "empty") {
    if (out.pending !== 0) lacking.push(`${out.pending} waiting request(s)`);
    if (out.passiveCount !== 0)
      lacking.push(`${out.passiveCount} passive scope(s)`);
    if (out.bans !== 0) lacking.push("an open ban");
    if (lacking.length > 0)
      throw new Fail(
        `the seed's state is not here (${lacking.join(", ")}): the scenario "seed" needs an empty home; another walk left data behind`
      );
  } else if (mode === "rows" || mode === "queues") {
    if (out.applications === 0) lacking.push("a pending köşk application");
    if (out.decks === 0) lacking.push("a pending deck publish request");
    if (out.bans === 0) lacking.push("an open ban");
    if (mode === "rows") {
      if (out.inactiveMadrasah === 0)
        lacking.push("a medrese with no başmüderris");
      if ((out.inactiveCourse ?? 0) !== 0)
        lacking.push("no course without a hoca (there is one)");
    } else if (out.passiveCount !== 0) {
      lacking.push("no passive scope (there is one)");
    }
    if (lacking.length > 0)
      throw new Fail(
        `the stack does not hold what the scenario "${mode}" needs: ${lacking.join(", ")}. The seed makes none of the rows and this walk does not make them (ask: data for nizam.home.chiefOverview)`
      );
  }
  console.log(
    `chief-home ${mode ?? "read"} pending=${out.pending} kosk=${out.kosk} madrasah=${out.madrasah} course=${out.course} students=${out.students} applications=${out.applications} decks=${out.decks} passive=${out.passiveCount} bans=${out.bans}`
  );
});
