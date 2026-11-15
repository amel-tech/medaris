// A köşk of the walk's own, for tedris.discover.followKosk's stale-page walk (binding.stale.yaml): one that Keşfet lists, and that a
// second person then hides while the talebe's page is still open.
//
//   node ../tedris/discover/followKosk/spare-kosk.mjs make <handle> <name>   opens it, as the başnazım (POST /kosks); an earlier one with the
//                                                                            same short name is removed first, so a walk that died leaves nothing
//   node ../tedris/discover/followKosk/spare-kosk.mjs hide <handle>          hides it (POST /kosks/{id}/hide), as the başnazım may
//
// Prints `spare-kosk made <handle>` or `spare-kosk hidden <handle>`. The way back is helpers/remove-kosk.mjs <handle>, which deletes the
// köşk with its followers whether it is listed or hidden (the directory the başnazım reads holds hidden köşks too). Everything goes through
// tedrisat's own API; no SQL. The köşk's one nazım is the seeded köşk nazımı, so the başnazım is not among them (no self-grant refusal).
import { Fail, must, run, subOf } from "../../../bindings/helpers/lib.mjs";

const handleOf = (raw) => {
  if (!raw)
    throw new Fail(
      "usage: spare-kosk.mjs make <handle> <name> | hide <handle>",
      2
    );
  return raw.replace(/^@/, "").toLowerCase();
};

const find = async (handle) => {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  return (found.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === handle
  );
};

run("spare-kosk", async () => {
  const [mode, raw, name, ...more] = process.argv.slice(2);
  const handle = handleOf(raw);
  if (more.length) throw new Fail("too many arguments", 2);

  if (mode === "make") {
    if (!name) throw new Fail("make needs a name", 2);
    for (const k of await find(handle))
      await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
    await must("SYSTEM_ADMIN", "POST", "/kosks", {
      name,
      handle,
      managerUserIds: [subOf("koskNazim")],
    });
    console.log(`spare-kosk made ${handle}`);
    return;
  }

  if (mode === "hide") {
    const [k] = await find(handle);
    if (!k) throw new Fail(`no köşk with the short name ${handle}`);
    await must("SYSTEM_ADMIN", "POST", `/kosks/${k.id}/hide`);
    console.log(`spare-kosk hidden ${handle}`);
    return;
  }

  throw new Fail(
    "usage: spare-kosk.mjs make <handle> <name> | hide <handle>",
    2
  );
});
