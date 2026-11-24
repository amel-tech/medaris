#!/usr/bin/env node
// The setup, the teardown and the effect checks of nizam.platform.policies' binding. Run from graphs/bindings/ (the replay's working directory):
//
//   node helpers/policies.mjs keep                       record both platform policies, exactly, before a walk
//   node helpers/policies.mjs restore                    put every recorded value back, exactly, and forget the record
//   node helpers/policies.mjs get <KEY>                  what the table holds for one key now
//   node helpers/policies.mjs audit <KEY> <enabled> <was>   the newest platform_policy.change row of that key since `keep`
//   node helpers/policies.mjs change-and-back <KEY>      switch one policy and switch it back (two audited changes), for a flow that needs the row
//   node helpers/policies.mjs scope-make                 a köşk of the walk's own that applies "Kayıt her zaman onaylı" itself
//   node helpers/policies.mjs scope-remove               the way back for it
//   node helpers/policies.mjs lock <KEY> <tag>           switch one policy on by SQL, after writing its row (or the word that there is none) to
//                                                        graphs/.local/made/<tag>-policy.json; the file is never overwritten, so a second lock after
//                                                        a crashed walk still remembers the true original. Prints `policy lock <KEY> on (was ...)`
//   node helpers/policies.mjs unlock <tag>               put that row back exactly as the file has it (key, enabled, changed_by, changed_at), or
//                                                        delete the row if there was none, and remove the file; `none` when there is no file.
//                                                        Prints `policy restore <tag> ...`. These two are not `keep`/`restore`: they hold one key, by
//                                                        SQL both ways, and the API's audit row is never written (nizam.kosks.editAndHide: the API
//                                                        stamps changed_by and changed_at with the caller and the moment, so it cannot give the row back)
//
// WHY THIS IS NOT THE API. The two switches are global: every köşk, medrese and course reads them on every decision. The old e2e deleted every
// row of platform_policies and wrote back what it had seen, so a crash between the two statements left the database with no policies. Nothing here
// deletes a row it did not record, and nothing is written unless a record of the values to return to exists on disk first.
//
// WHAT "EXACTLY" MEANS. A key nobody ever switched has NO row and reads as off (platform-policy.repository.ts:66). tedrisat's own PUT creates the
// row and stamps `changed_by` and `changed_at`; switching a policy on and off through the page therefore leaves "enabled" as it was but a row
// where there was none, and another person and moment where there were some. `keep` records, per key, either "no row" or the row's three columns
// (enabled, changed_by, changed_at as text, microseconds and zone included). `restore` deletes the row that was not there and rewrites the row that
// was, in one transaction, so what is read afterwards is what was read before: the page's "changedBy" and "changedAt" included.
//
// THE AUDIT ROWS. audit_log is append-only by design ("nothing ever updates or deletes a row, and the API has no route that could",
// audit.schema.ts:17), and every switch writes one `platform_policy.change` row, so a walk would leave two for each path it takes. `restore` therefore
// deletes, by SQL as the app's own e2e does (apps/nizam/e2e/kosk-seed.ts) and as nizam.platform.auditLog's helper does for its own rows, exactly the rows
// this flow wrote: action platform_policy.change, the başnazım as actor, one of the two keys, and a number (seq) above the one `keep` recorded. Nothing
// else of the log is touched. What stays: the three rows of the köşk of scope-make (kosk.create, kosk.policy_change and the deletion's own, which is
// written so that a deletion leaves a trace); `audit` reads "newer than the record", never "the only one". If the owner would rather the audit table were
// never written by a helper, take the one `delete from audit_log` out of `restore`: the rows then stay, and nothing else changes.
//
// THE RECORD is graphs/.local/made/platform-policies.json (git-ignored). A walk that died before its teardown leaves it, and the next `keep`
// first restores it (the values it holds are the ones from before ANY walk) and then records afresh; `restore` run by hand does the same:
//   (cd graphs/bindings && node helpers/policies.mjs restore)
// `restore` also removes the köşk of scope-make, so a teardown with one line leaves nothing, whichever scenario ran.
//
// Everything goes through the shared helpers: SQL through the stack's Postgres container (db.mjs), the API as the başnazım (lib.mjs; the real
// sign-in, no password grant, no Keycloak admin). Nothing secret is printed.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "./db.mjs";
import { Fail, LOCAL, must, run, subOf } from "./lib.mjs";

const KEYS = ["ALWAYS_REQUIRE_APPROVAL", "RECORDINGS_NEVER_PUBLIC"];
const RECORD = resolve(LOCAL, "made", "platform-policies.json");
const MADE = resolve(LOCAL, "made");
const policyFileOf = (tag) => resolve(MADE, `${tag}-policy.json`);
const goodTag = (tag) => {
  if (!/^[a-z0-9]+$/.test(tag ?? ""))
    throw new Fail("a tag is lower-case letters and digits", 2);
};
// the köşk of scope-make: unlisted, a spare talebe as its only nazım, and its own "always require approval" on
const KOSK = {
  handle: "politika-deneme",
  name: "Politika Deneme Köşkü",
  nazim: "applicantB",
};

const rowsOf = (stdout) =>
  stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));

function keyOf(arg) {
  if (!KEYS.includes(arg))
    throw new Fail(`a policy key is one of ${KEYS.join(", ")}, not ${arg}`, 2);
  return arg;
}

async function snapshot() {
  const rows = rowsOf(
    await query(
      `select key, enabled, changed_by, changed_at::text as changed_at from platform_policies where key in (${KEYS.map((k) => `'${k}'`).join(", ")}) order by key`
    )
  );
  const seq = rowsOf(
    await query(
      "select coalesce(max(seq), 0)::bigint::text as seq from audit_log"
    )
  )[0].seq;
  const keys = Object.fromEntries(KEYS.map((k) => [k, null]));
  for (const r of rows)
    keys[r.key] = {
      enabled: r.enabled,
      changedBy: r.changed_by,
      changedAt: r.changed_at,
    };
  return { taken: new Date().toISOString(), auditSeq: seq, keys };
}

const shown = (rec) =>
  KEYS.map((k) => `${k}:${rec.keys[k] ? rec.keys[k].enabled : "none"}`).join(
    " "
  );

function readRecord() {
  if (!existsSync(RECORD)) return null;
  return JSON.parse(readFileSync(RECORD, "utf8"));
}

function writeRecord(rec) {
  mkdirSync(resolve(LOCAL, "made"), { recursive: true });
  const tmp = `${RECORD}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, RECORD); // a reader sees the old record or the new one, never half of one
}

/** The SQL that returns one key to what the record holds: the row deleted when there was none, else rewritten column by column. */
function restoreSql(key, held) {
  if (held === null)
    return `delete from platform_policies where key = '${key}'`;
  // the values come from our own record; they are checked before they go into a statement
  if (typeof held.enabled !== "boolean")
    throw new Fail(
      `the record of ${key} has an enabled that is not true or false`
    );
  const by =
    held.changedBy === null
      ? "null"
      : /^[0-9a-f-]{36}$/i.test(held.changedBy)
        ? `'${held.changedBy}'`
        : (() => {
            throw new Fail(
              `the record of ${key} has a changed_by that is no uuid`
            );
          })();
  if (
    !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?[+-]\d\d(:?\d\d)?$/.test(
      held.changedAt ?? ""
    )
  )
    throw new Fail(`the record of ${key} has a changed_at it cannot read`);
  return `insert into platform_policies (key, enabled, changed_by, changed_at) values ('${key}', ${held.enabled}, ${by}, '${held.changedAt}'::timestamptz) on conflict (key) do update set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at`;
}

async function removeKosk() {
  const found = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/kosks/directory?q=${encodeURIComponent(KOSK.handle)}&limit=50`
  );
  const same = (found.body.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === KOSK.handle
  );
  for (const k of same) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
  return same.length;
}

async function restore() {
  // the values first, by SQL: putting them back must not depend on the API answering
  const rec = readRecord();
  let said = "none (no record)";
  if (rec) {
    await query(
      KEYS.map((k) => restoreSql(k, rec.keys[k] ?? null)).join(";\n")
    );
    // read it back: what is there now must be what the record holds, or the record stays for the next try
    const now = await snapshot();
    for (const k of KEYS)
      if (JSON.stringify(now.keys[k]) !== JSON.stringify(rec.keys[k] ?? null))
        throw new Fail(
          `${k} is not what the record holds after the restore: ${JSON.stringify(now.keys[k])} against ${JSON.stringify(rec.keys[k] ?? null)}`
        );
    said = shown(rec);
    const chief = subOf("SYSTEM_ADMIN");
    if (!/^[0-9a-f-]{36}$/i.test(chief) || !/^\d+$/.test(rec.auditSeq ?? ""))
      throw new Fail(
        "the record or the başnazım's id cannot be used to find the audit rows of this flow"
      );
    const rows = rowsOf(
      await query(
        `delete from audit_log where actor_id = '${chief}' and action = 'platform_policy.change' and details->>'key' in (${KEYS.map((k) => `'${k}'`).join(", ")}) and seq > ${rec.auditSeq} returning seq`
      )
    );
    said += `, ${rows.length} audit rows deleted`;
    unlinkSync(RECORD);
  }
  // then the köşk of scope-make, the one thing outside platform_policies a walk of this flow leaves; a failure here is
  // reported after the values are already back
  const gone = await removeKosk();
  console.log(`policies restored ${said} (${gone} köşk removed)`);
}

async function keep() {
  const left = readRecord();
  if (left) {
    // a walk died before its teardown: what its record holds is the state from before any walk
    await restore();
    console.log("policies: an earlier record was restored first");
  } else {
    await removeKosk(); // a köşk a dead walk left, if there is no record to say it was one
  }
  const rec = await snapshot();
  writeRecord(rec);
  console.log(`policies kept ${shown(rec)}`);
}

async function get(key) {
  const [row] = rowsOf(
    await query(`select enabled from platform_policies where key = '${key}'`)
  );
  // a key with no row reads as off (platform-policy.repository.ts:66), so a check for "off" is the same line either way
  console.log(
    row
      ? `policy ${key} enabled=${row.enabled}`
      : `policy ${key} enabled=false (no row)`
  );
}

async function audit(key, enabled, was) {
  const rec = readRecord();
  const since = rec ? rec.auditSeq : "0";
  if (!/^\d+$/.test(since))
    throw new Fail("the record has an audit seq that is no number");
  const [row] = rowsOf(
    await query(
      `select details->>'enabled' as enabled, details->>'was' as was from audit_log where action = 'platform_policy.change' and details->>'key' = '${key}' and seq > ${since} order by seq desc limit 1`
    )
  );
  if (!row)
    throw new Fail(
      `no platform_policy.change row of ${key} after the record${rec ? "" : " (there is no record: every row counts)"}`
    );
  const line = `audit ${key} enabled=${row.enabled} was=${row.was}`;
  if (row.enabled !== enabled || row.was !== was)
    throw new Fail(`${line}, expected enabled=${enabled} was=${was}`);
  console.log(line);
}

async function changeAndBack(key) {
  const now = rowsOf(
    await query(`select enabled from platform_policies where key = '${key}'`)
  )[0];
  const was = now ? now.enabled : false;
  for (const enabled of [!was, was])
    await must("SYSTEM_ADMIN", "PUT", `/nizam/platform-policies/${key}`, {
      enabled,
    });
  console.log(`policies changed ${key} to ${!was} and back to ${was}`);
}

async function scopeMake() {
  await removeKosk();
  const made = await must("SYSTEM_ADMIN", "POST", "/kosks", {
    name: KOSK.name,
    handle: KOSK.handle,
    isPrivate: true,
    managerUserIds: [subOf(KOSK.nazim)],
  });
  const id = made.body.id;
  // PATCH, not the create body: only an update writes the `kosk.policy_change` row that gives the table its "Açan" and "Tarih"
  await must("SYSTEM_ADMIN", "PATCH", `/kosks/${id}`, {
    alwaysRequireApproval: true,
  });
  console.log(`scope-make ${KOSK.handle} ${id}`);
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

async function unlock(tag) {
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

run("policies", async () => {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "keep") return keep();
  if (command === "restore") return restore();
  if (command === "get") return get(keyOf(rest[0]));
  if (command === "audit") {
    const [key, enabled, was] = rest;
    if (
      !["true", "false"].includes(enabled) ||
      !["true", "false"].includes(was)
    )
      throw new Fail("usage: audit <KEY> <true|false> <true|false>", 2);
    return audit(keyOf(key), enabled, was);
  }
  if (command === "change-and-back") return changeAndBack(keyOf(rest[0]));
  if (command === "scope-make") return scopeMake();
  if (command === "scope-remove") {
    console.log(`scope-remove ${KOSK.handle} removed ${await removeKosk()}`);
    return undefined;
  }
  if (command === "lock") {
    const [key, tag, ...more] = rest;
    if (!key || !tag || more.length)
      throw new Fail("usage: lock <KEY> <tag>", 2);
    goodTag(tag);
    console.log(await lock(key, tag));
    return undefined;
  }
  if (command === "unlock") {
    const [tag, ...more] = rest;
    if (!tag || more.length) throw new Fail("usage: unlock <tag>", 2);
    goodTag(tag);
    console.log(await unlock(tag));
    return undefined;
  }
  throw new Fail(
    "commands: keep | restore | get <KEY> | audit <KEY> <enabled> <was> | change-and-back <KEY> | scope-make | scope-remove | lock <KEY> <tag> | unlock <tag>",
    2
  );
});
