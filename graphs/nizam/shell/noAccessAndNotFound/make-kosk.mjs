// A köşk of a walk's own, with a nazım who is not the account that walks: the "köşk that is not theirs" of
// nizam.shell.noAccessAndNotFound (shell#6: another köşk's Başvurular). The seed's two köşks are both the köşk nazımı's, so a köşk
// he does not manage has to be made. It is made through tedrisat's API as the başnazım, whom the API lets open a köşk (POST /kosks:
// apps/tedrisat/src/kosk/kosk.controller.ts:310), with one nazım, an account of the walk's choosing, and taken away again by its tag.
//
//   node make-kosk.mjs make <tag> <MANAGER_ACCOUNT>
//   node make-kosk.mjs remove <tag>
//
// make    Opens a köşk named `Deneme köşkü <tag>` with the short name `deneme-<tag>` and the account as its only nazım (the başnazım is
//         never one of them: kosk.controller.ts:319), and prints, on one line, {"tag","kosk","handle","manager"}; the same is written to
//         graphs/.local/made/<tag>.json, which a binding reads as a data source (`made: { json: ../.local/made/<tag>.json }`, then
//         `{made.kosk}`). A köşk of that short name made before is removed first, so a walk that died before its teardown leaves
//         nothing for the next one.
// remove  Deletes every köşk with that short name, as the başnazım may (DELETE /kosks/<id>, which takes the köşk's role assignments with it
//         in one transaction: kosk.controller.ts:367), and the file. Safe to run twice: it says `removed 0` the second time.
//
// Only the API is used, no SQL. What it cannot undo: the audit rows of the creation and of the lookup, which the API has no way to remove
// (the seed does not depend on them). The manager account must have no other part in a walk that runs at the same time: run both under
// the replay lock (COMMON.md, round R2).
//
// Written without being run (the first walks are a later phase). It follows graphs/bindings/helpers/remove-kosk.mjs, which is run, for
// the directory search and the delete; the body of POST /kosks is CreateKoskDto (name, handle, managerUserIds), the rest is optional.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: make-kosk.mjs make <tag> <MANAGER_ACCOUNT> | remove <tag>";
const handleOf = (tag) => `deneme-${tag}`;
const fileOf = (tag) => resolve(MADE, `${tag}.json`);

/** The köşks of that short name, as the directory the başnazım reads lists them. */
async function withHandle(handle) {
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
}

async function remove(tag) {
  const same = await withHandle(handleOf(tag));
  for (const k of same) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
  rmSync(fileOf(tag), { force: true });
  return `kosk remove ${tag} removed ${same.length}`;
}

async function make(tag, manager) {
  await remove(tag); // a tag made before goes first
  const handle = handleOf(tag);
  const created = (
    await must("SYSTEM_ADMIN", "POST", "/kosks", {
      name: `Deneme köşkü ${tag}`,
      handle,
      managerUserIds: [subOf(manager)],
    })
  ).body;
  if (!created?.id) throw new Fail("POST /kosks answered no id");
  const made = {
    tag,
    kosk: created.id,
    handle,
    manager: accountKey(manager),
  };
  mkdirSync(MADE, { recursive: true });
  writeFileSync(fileOf(tag), `${JSON.stringify(made, null, 2)}\n`);
  return JSON.stringify(made);
}

run("make-kosk", async () => {
  const [verb, tag, manager, ...more] = process.argv.slice(2);
  if (!tag || more.length || (verb === "make" && !manager))
    throw new Fail(usage, 2);
  if (!/^[a-z0-9]+$/.test(tag))
    throw new Fail("a tag is lower-case letters and digits", 2);
  if (verb === "make") console.log(await make(tag, manager));
  else if (verb === "remove" && !manager) console.log(await remove(tag));
  else throw new Fail(usage, 2);
});
