// Deletes every köşk that has the given short name (handle), as the başnazım may: the way back for a walk that opens a köşk.
// A name nobody holds is not a failure.
//
//   node helpers/remove-kosk.mjs <handle>
//
// Prints `remove-kosk <handle> removed <n>`.
import { Fail, must, run } from "./lib.mjs";

run("remove-kosk", async () => {
  const [raw, ...more] = process.argv.slice(2);
  if (!raw || more.length) throw new Fail("usage: remove-kosk.mjs <handle>", 2);
  const handle = raw.replace(/^@/, "").toLowerCase();
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  const same = (found.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === handle
  );
  for (const k of same) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
  console.log(`remove-kosk ${handle} removed ${same.length}`);
});
