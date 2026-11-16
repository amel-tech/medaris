// The data of nizam.kosks.editAndHide's walks: a köşk of their own, whose nazım is a spare talebe account, and, for the locked branch,
// a platform policy that is switched on for the length of the walk and put back exactly as it was. Run by a binding's `setup` and
// `teardown` (the working directory is graphs/bindings/); by hand only under the replay lock (COMMON.md, round R2).
//
//   node ../nizam/kosks/editAndHide/walk-data.mjs make <tag> <MANAGER_ACCOUNT> [--ruled]
//   node ../nizam/kosks/editAndHide/walk-data.mjs remove <tag>
//   node ../nizam/kosks/editAndHide/walk-data.mjs policy lock <KEY> <tag>
//   node ../nizam/kosks/editAndHide/walk-data.mjs policy restore <tag>
//
// make     Opens the köşk "Ayar Deneme Köşkü" (short name ayar-deneme, tag Akaid, the Lâciverd cover, one line of description, listed,
//          both köşk policies off) through tedrisat's API as the başnazım, with the account as its only nazım (POST /kosks:
//          kosk.controller.ts:310; the başnazım is never one of them), and prints one line of JSON, {"tag","kosk","handle","name","manager",
//          "ruled"}; the same is written to graphs/.local/made/<tag>.json, which a binding reads as a data source (`{made.kosk}`).
//          --ruled opens it with "Ders kayıtları herkese açılamaz" already on: the locked branch needs a köşk that can switch it off.
//          A köşk with that short name made before is removed first, so a walk that died before its teardown leaves nothing behind.
// remove   Deletes every köşk with the short name ayar-deneme, hidden or not, as the başnazım may (DELETE /kosks/<id>, which takes the
//          köşk's role assignments with it in one transaction: kosk.controller.ts:367), and the file. Says `removed 0` the second time.
// check <tag> <ACCOUNT> <field=value>...
//          Reads the köşk (GET /kosks/<id>) as the account and compares the fields it is given: name, tags (joined by a comma),
//          description, coverHue, isPrivate, alwaysRequireApproval, recordingsNeverPublic. Prints `kosk matches <n> fields`, or fails with
//          what differs. For a binding's `effects`: what a save left in the database, which the screen does not show.
// listed <tag>
//          Whether the open list that anybody may read (GET /kosks?limit=50, no token) holds the köşk: `kosk listed true` or `kosk listed false`
//          (the e2e kosks#8 reads the same list). An unlisted or hidden köşk is not in it.
// status <tag>
//          The köşk's status in the directory as the başnazım reads it, ACTIVE, PASSIVE or HIDDEN, or `none`: `kosk status <STATUS>`.
// policy lock <KEY> <tag>
//          Switches the platform policy KEY (ALWAYS_REQUIRE_APPROVAL or RECORDINGS_NEVER_PUBLIC) on. Before it touches anything it writes
//          the row `platform_policies` has for KEY (or the word that there is none) to graphs/.local/made/<tag>-policy.json, and it never
//          overwrites that file, so a second lock after a crashed walk still remembers the true original.
// policy restore <tag>
//          Puts the row back exactly as the file has it (key, enabled, changed_by, changed_at), or deletes the row if there was none,
//          and removes the file. Says `none` when there is no file.
//
// Why SQL for the policy and not the API (PUT /nizam/platform-policies/:key, platform-policy.controller.ts:67): the API stamps changed_by
// and changed_at with the caller and the moment and writes an audit row `platform_policy.change` each way, so it cannot give the row
// back as it was, and the audit log would say a policy was switched on and off. Through SQL the table is exactly what it was and the
// audit log is untouched by the lock. Everything else is the API. What stays after a walk: the audit rows the API writes and has no way
// to remove: kosk.create and kosk.delete, and what the walk itself does to the köşk (kosk.policy_change for a save that touches a
// policy, kosk.hide for the hide). No nazım lookup is made: the account's id is read from accounts.env.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  API,
  accountKey,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const NAME = "Ayar Deneme Köşkü";
const HANDLE = "ayar-deneme";
const KEYS = ["ALWAYS_REQUIRE_APPROVAL", "RECORDINGS_NEVER_PUBLIC"];
const usage =
  "usage: walk-data.mjs make <tag> <MANAGER_ACCOUNT> [--ruled] | remove <tag> | check <tag> <ACCOUNT> <field=value>... | listed <tag> | status <tag> | policy lock <KEY> <tag> | policy restore <tag>";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const policyFileOf = (tag) => resolve(MADE, `${tag}-policy.json`);
const goodTag = (tag) => {
  if (!/^[a-z0-9]+$/.test(tag ?? ""))
    throw new Fail("a tag is lower-case letters and digits", 2);
};

/** The köşks with that short name, hidden ones too (the directory's default status is ALL). */
async function withHandle() {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(HANDLE)}&limit=50`
    )
  ).body;
  return (found.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === HANDLE
  );
}

async function remove(tag) {
  const same = await withHandle();
  for (const k of same) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
  rmSync(fileOf(tag), { force: true });
  return `kosk remove ${tag} removed ${same.length}`;
}

async function make(tag, manager, ruled) {
  await remove(tag); // one made before goes first
  const created = (
    await must("SYSTEM_ADMIN", "POST", "/kosks", {
      name: NAME,
      handle: HANDLE,
      description: "Deneme için açılmış köşk.",
      tags: ["Akaid"],
      coverHue: 250, // Lâciverd: TONE_HUE in libs/ui/src/mds/cover-pattern.tsx
      isPrivate: false,
      alwaysRequireApproval: false,
      recordingsNeverPublic: ruled,
      managerUserIds: [subOf(manager)],
    })
  ).body;
  if (!created?.id) throw new Fail("POST /kosks answered no id");
  const made = {
    tag,
    kosk: created.id,
    handle: HANDLE,
    name: NAME,
    manager: accountKey(manager),
    ruled,
  };
  mkdirSync(MADE, { recursive: true });
  writeFileSync(fileOf(tag), `${JSON.stringify(made, null, 2)}\n`);
  return JSON.stringify(made);
}

async function check(tag, account, pairs) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(`no köşk made under the tag ${tag}`);
  const made = JSON.parse(readFileSync(fileOf(tag), "utf8"));
  const kosk = (await must(account, "GET", `/kosks/${made.kosk}`)).body;
  const wrong = [];
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at < 1) throw new Fail(`${pair} is not field=value`, 2);
    const key = pair.slice(0, at);
    const want = pair.slice(at + 1);
    let got = kosk[key];
    if (key === "tags") got = (got ?? []).join(",");
    else if (got === null || got === undefined) got = "";
    if (String(got) !== want)
      wrong.push(
        `${key} is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`
      );
  }
  if (wrong.length) throw new Fail(`kosk differs: ${wrong.join("; ")}`);
  return `kosk matches ${pairs.length} fields`;
}

async function listed(tag) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(`no köşk made under the tag ${tag}`);
  const made = JSON.parse(readFileSync(fileOf(tag), "utf8"));
  const res = await fetch(`${API}/kosks?limit=50`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Fail(`GET /kosks?limit=50 answered ${res.status}`);
  const body = await res.json();
  return `kosk listed ${(body.items ?? []).some((k) => k.id === made.kosk)}`;
}

async function status() {
  const same = await withHandle();
  return `kosk status ${same[0]?.status ?? "none"}`;
}

const sqlText = (v) => `'${String(v).replace(/'/g, "''")}'`;

async function lock(key, tag) {
  if (!KEYS.includes(key))
    throw new Fail(`${key} is not one of ${KEYS.join(", ")}`, 2);
  mkdirSync(MADE, { recursive: true });
  const file = policyFileOf(tag);
  let was;
  if (existsSync(file)) {
    // a walk that died left the original here: it is the truth, not what the table says now
    was = JSON.parse(readFileSync(file, "utf8"));
    if (was.key !== key)
      throw new Fail(
        `${file} holds the original of ${was.key}, not ${key}: run policy restore ${tag} first`
      );
  } else {
    const rows = (
      await query(
        `select key, enabled, changed_by, changed_at from platform_policies where key = ${sqlText(key)}`
      )
    )
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    was = { key, row: rows[0] ?? null };
    writeFileSync(file, `${JSON.stringify(was, null, 2)}\n`);
  }
  await query(
    `insert into platform_policies (key, enabled) values (${sqlText(key)}, true)
     on conflict (key) do update set enabled = true`
  );
  return `policy lock ${key} on (was ${was.row === null ? "no row" : was.row.enabled ? "on" : "off"})`;
}

async function restore(tag) {
  const file = policyFileOf(tag);
  if (!existsSync(file)) return `policy restore ${tag} none`;
  const { key, row } = JSON.parse(readFileSync(file, "utf8"));
  if (!KEYS.includes(key))
    throw new Fail(`${file} names ${key}, which is no policy`);
  if (row === null) {
    await query(`delete from platform_policies where key = ${sqlText(key)}`);
  } else {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      typeof row.enabled !== "boolean" ||
      (row.changed_by !== null && !uuid.test(row.changed_by)) ||
      Number.isNaN(Date.parse(row.changed_at))
    )
      throw new Fail(
        `${file} holds a row that is not what platform_policies has`
      );
    await query(
      `insert into platform_policies (key, enabled, changed_by, changed_at)
       values (${sqlText(key)}, ${row.enabled}, ${row.changed_by === null ? "null" : sqlText(row.changed_by)}, ${sqlText(row.changed_at)}::timestamptz)
       on conflict (key) do update set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at`
    );
  }
  rmSync(file, { force: true });
  return `policy restore ${tag} restored ${key} (${row === null ? "no row" : row.enabled ? "on" : "off"})`;
}

run("walk-data", async () => {
  const args = process.argv.slice(2);
  const [verb, ...rest] = args;
  if (verb === "make") {
    const ruled = rest.includes("--ruled");
    const [tag, manager, ...more] = rest.filter((a) => a !== "--ruled");
    if (!tag || !manager || more.length) throw new Fail(usage, 2);
    goodTag(tag);
    console.log(await make(tag, manager, ruled));
  } else if (verb === "check") {
    const [tag, account, ...pairs] = rest;
    if (!tag || !account || pairs.length === 0) throw new Fail(usage, 2);
    goodTag(tag);
    console.log(await check(tag, account, pairs));
  } else if (verb === "listed") {
    const [tag, ...more] = rest;
    if (!tag || more.length) throw new Fail(usage, 2);
    goodTag(tag);
    console.log(await listed(tag));
  } else if (verb === "status") {
    const [tag, ...more] = rest;
    if (!tag || more.length) throw new Fail(usage, 2);
    goodTag(tag);
    console.log(await status());
  } else if (verb === "remove") {
    const [tag, ...more] = rest;
    if (!tag || more.length) throw new Fail(usage, 2);
    goodTag(tag);
    console.log(await remove(tag));
  } else if (verb === "policy" && rest[0] === "lock") {
    const [, key, tag, ...more] = rest;
    if (!key || !tag || more.length) throw new Fail(usage, 2);
    goodTag(tag);
    console.log(await lock(key, tag));
  } else if (verb === "policy" && rest[0] === "restore") {
    const [, tag, ...more] = rest;
    if (!tag || more.length) throw new Fail(usage, 2);
    goodTag(tag);
    console.log(await restore(tag));
  } else throw new Fail(usage, 2);
});
