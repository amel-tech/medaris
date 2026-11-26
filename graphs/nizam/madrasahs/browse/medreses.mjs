// The walk data of nizam.madrasahs.browse: the passive and the hidden medreses the Pasif and Gizli tabs need, made through tedrisat's HTTP API as the
// başnazım, and the counts the tabs must show. It is the binding's `setup` and `teardown`: `node medreses.mjs <command>`, run from graphs/bindings/ as
// `node ../nizam/madrasahs/browse/medreses.mjs ...`. Only the HTTP API is used (no SQL). The seeded medrese is only read, never passivated, hidden or
// changed.
//
//   up mixed     Removes what an earlier walk of this flow left, then makes three medreses with the spare talebe account APPLICANT_F as the başmüderris of
//                each at first (POST /madrasahs): "Gezinti Pasif Medresesi" (handle gezinti-pasif), which it takes out of service (GET .../deactivation-preview,
//                POST .../deactivate with its confirmation: the başmüderris leaves the post, so it is passive and unassigned), and "Gezinti Gizli Medresesi"
//                (gezinti-gizli), which it hides (POST .../hide), the başmüderris staying. Then it reads the directory and checks that the platform holds
//                exactly one passive and one hidden medrese, so that a leftover of another walk is named instead of walked over.
//   up many      The same with a second passive medrese, "Gezinti Pasif Medresesi 2" (gezinti-pasif-2): two passive, one hidden.
//   down         Deletes every medrese whose short name begins with "gezinti-" (DELETE /madrasahs/<id>, hidden or passive or active; the başmüderris role goes
//                with it) and the record. `none` when there is nothing.
//   counts       Reads the directory and writes the counts and the names to graphs/.local/made/browse-medreses.json, which the binding reads as {counts.*}.
//   expect P H   Reads the counts as `counts` does and fails unless the platform holds P passive and H hidden medreses: the stack's seed is one active
//                medrese and nothing else, so `expect 0 0` says a walk that needs "every medrese is active" may run.
//
// Everything is told in one short line on stdout; a refusal is one line on stderr and a non-zero exit. Nothing secret is printed. Run by hand, every command
// takes the replay lock (CONVENTIONS, round R2).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HEAD = "APPLICANT_F";
const PREFIX = "gezinti-";
const FILE = resolve(LOCAL, "made", "browse-medreses.json");
const PASSIVE = { name: "Gezinti Pasif Medresesi", handle: "gezinti-pasif" };
const PASSIVE2 = {
  name: "Gezinti Pasif Medresesi 2",
  handle: "gezinti-pasif-2",
};
const HIDDEN = { name: "Gezinti Gizli Medresesi", handle: "gezinti-gizli" };
const usage =
  "usage: medreses.mjs up mixed|many | down | counts | expect <passive> <hidden>";

const directory = async () =>
  (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      "/madrasahs/directory?status=ALL&limit=50"
    )
  ).body;

const ours = (dir) => dir.items.filter((m) => m.handle.startsWith(PREFIX));

async function remove() {
  const ids = ours(await directory()).map((m) => m.id);
  for (const id of ids)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  rmSync(FILE, { force: true });
  return ids;
}

async function open(m) {
  const made = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name: m.name,
    handle: m.handle,
    headMuderrisUserId: subOf(HEAD),
  });
  return made.body.id;
}

async function passivate(id) {
  const preview = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/madrasahs/${id}/deactivation-preview`
  );
  await must("SYSTEM_ADMIN", "POST", `/madrasahs/${id}/deactivate`, {
    confirmation: preview.body.confirmation,
  });
}

// what the binding reads: the numbers the tabs must show and the names the warning and the rows must carry
async function record() {
  const dir = await directory();
  const passive = dir.passive.map((p) => p.name);
  const record = {
    ...dir.counts,
    passiveNames: new Intl.ListFormat("tr", {
      style: "long",
      type: "conjunction",
    }).format(passive),
    passiveCount: passive.length,
    ids: ours(dir).map((m) => m.id),
  };
  mkdirSync(dirname(FILE), { recursive: true, mode: 0o700 });
  writeFileSync(FILE, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

const told = (c) =>
  `all=${c.all} active=${c.active} passive=${c.passive} hidden=${c.hidden}`;

async function expectCounts(passive, hidden) {
  const c = await record();
  if (c.passive !== passive || c.hidden !== hidden)
    throw new Fail(
      `the platform holds ${c.passive} passive and ${c.hidden} hidden medreses, the walk needs ${passive} and ${hidden}: another walk left some behind (${told(c)})`
    );
  return c;
}

async function up(mode) {
  if (mode !== "mixed" && mode !== "many") throw new Fail(usage, 2);
  await remove();
  const first = await open(PASSIVE);
  await passivate(first);
  if (mode === "many") await passivate(await open(PASSIVE2));
  const hidden = await open(HIDDEN);
  await must("SYSTEM_ADMIN", "POST", `/madrasahs/${hidden}/hide`);
  const c = await expectCounts(mode === "many" ? 2 : 1, 1);
  console.log(`browse up ${mode} ${told(c)}`);
}

run("browse", async () => {
  const [verb, a, b, ...more] = process.argv.slice(2);
  if (more.length) throw new Fail(usage, 2);
  if (verb === "up" && a && !b) return up(a);
  if (verb === "down" && !a) {
    const ids = await remove();
    console.log(`browse down ${ids.length ? ids.join(" ") : "none"}`);
    return undefined;
  }
  if (verb === "counts" && !a) {
    console.log(`browse counts ${told(await record())}`);
    return undefined;
  }
  if (verb === "expect" && a !== undefined && b !== undefined) {
    const c = await expectCounts(Number(a), Number(b));
    console.log(`browse expect ${told(c)}`);
    return undefined;
  }
  throw new Fail(usage, 2);
});
