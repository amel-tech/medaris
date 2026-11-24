#!/usr/bin/env node
// The crowd tedris.discover.browse's paging walk needs: twelve more köşks, so that Keşfet lists more than one page of
// them (12 a page). A `run` of the scenario's `setup`, `teardown` and `effects` in binding.yaml; its working directory is
// graphs/bindings/, which is why the import below goes up three folders.
//
//   node ../tedris/discover/browse/fillers.mjs up       make the köşks (first removing any left by a walk that died)
//   node ../tedris/discover/browse/fillers.mjs down     remove them
//   node ../tedris/discover/browse/fillers.mjs count    one line for an `effects` check: `fillers 12`
//
// The köşks have the short names kesfet-deneme-01 .. kesfet-deneme-12, a name of the form "Deneme Köşkü 01", and a
// description that holds the word "medrese", so the search word of the walk ("medrese") finds all twelve beside the
// seed's own Süleymaniye Köşkü and its medrese. They are made as the başnazım (POST /kosks, SYSTEM_ADMIN) with the
// spare talebe `applicantB` as their first nazım, and removed as the başnazım (DELETE /kosks/:id, which takes a köşk with
// its role assignments in one transaction). The nazım is told by a notification when a köşk is made for them; the
// binding clears them with helpers/notify.mjs (`applicantB` has none in the seed, helpers/README.md).
//
// Never touches a köşk whose short name does not start with `kesfet-deneme-`. Nothing secret is printed: the helpers'
// token cache and accounts file are read inside lib.mjs (graphs/bindings/helpers).
import { Fail, must, run, subOf } from "../../../bindings/helpers/lib.mjs";

const PREFIX = "kesfet-deneme-";
const HOWMANY = 12;
const handleOf = (n) => `${PREFIX}${String(n).padStart(2, "0")}`;

async function mine() {
  const r = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/kosks/directory?q=${encodeURIComponent(PREFIX)}&limit=50`
  );
  return (r.body.items ?? []).filter((k) =>
    (k.handle ?? "").replace(/^@/, "").toLowerCase().startsWith(PREFIX)
  );
}

async function down() {
  const found = await mine();
  for (const k of found) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
  return found.length;
}

run("fillers", async () => {
  const [verb, ...more] = process.argv.slice(2);
  if (!["up", "down", "count"].includes(verb ?? "") || more.length)
    throw new Fail("usage: fillers.mjs up|down|count", 2);
  if (verb === "count") {
    console.log(`fillers ${(await mine()).length}`);
    return;
  }
  const removed = await down();
  if (verb === "down") {
    console.log(`fillers removed ${removed}`);
    return;
  }
  const manager = subOf("APPLICANT_B");
  for (let n = 1; n <= HOWMANY; n++) {
    await must("SYSTEM_ADMIN", "POST", "/kosks", {
      name: `Deneme Köşkü ${String(n).padStart(2, "0")}`,
      handle: handleOf(n),
      description: `Medrese usulüyle okuma halkası, ${n}. deneme.`,
      managerUserIds: [manager],
    });
  }
  console.log(`fillers made ${HOWMANY}`);
});
