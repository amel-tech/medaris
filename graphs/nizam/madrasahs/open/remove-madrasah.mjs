#!/usr/bin/env node
// The way back for a walk that opens a medrese (nizam.madrasahs.open): deletes the medrese a walk made, as the başnazım may, with
// the role it gave its başmüderris. A name nobody holds is not a failure, so the same line is the walk's `setup` and `teardown`.
//
//   node ../nizam/madrasahs/open/remove-madrasah.mjs <handle> [--numbered]
//
// <handle> is the short name the walk typed, or (when the form leaves it empty) the one tedrisat makes from the name.
// --numbered also removes the ones the server numbers when a handle is taken: <handle>-2, <handle>-3, ...
// Prints `remove-madrasah <handle> removed <n>`.
//
// It uses a route, not SQL: DELETE /madrasahs/:id (apps/tedrisat/src/madrasah/madrasah.controller.ts:691, SYSTEM_ADMIN alone) takes
// the medrese and every role assignment of its scope, the başmüderris's included, in one transaction (madrasah.repository.ts:205).
// What stays: the audit rows (madrasah.create, user.lookup, madrasah.delete), which the API cannot remove and nothing reads back.
//
// It refuses to touch the seed's medrese (the id in graphs/.local/seed.json) and any medrese that holds a course: a walk's own
// medrese has none, and DELETE would leave a course's köşk with no medrese.
//
// Written for this flow, in its own folder; it uses the shared helpers' lib.mjs. To be moved to graphs/bindings/helpers/ by the
// orchestrator (the way remove-kosk.mjs was).
import {
  Fail,
  must,
  options,
  run,
  seed,
} from "../../../bindings/helpers/lib.mjs";

run("remove-madrasah", async () => {
  const { rest, numbered } = options(process.argv.slice(2), {
    flags: ["numbered"],
  });
  const [raw, ...more] = rest;
  if (!raw || more.length)
    throw new Fail("usage: remove-madrasah.mjs <handle> [--numbered]", 2);
  const handle = raw.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(handle))
    throw new Fail(`${raw} is not a short name`, 2);
  const kept = seed().madrasah;
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/madrasahs/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  const mine = (found.items ?? []).filter((m) => {
    const h = (m.handle ?? "").replace(/^@/, "").toLowerCase();
    return h === handle || (numbered && new RegExp(`^${handle}-\\d+$`).test(h));
  });
  for (const m of mine) {
    if (m.id === kept)
      throw new Fail(`${m.handle} is the seed's medrese: never removed`);
    if ((m.courseCount ?? 0) > 0)
      throw new Fail(
        `${m.handle} holds ${m.courseCount} course(s): not a medrese this walk made`
      );
  }
  for (const m of mine)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${m.id}`);
  console.log(`remove-madrasah ${handle} removed ${mine.length}`);
});
