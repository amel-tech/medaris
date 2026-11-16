// The walk's own rows in the audit log, for nizam.platform.auditLog: what `setup` writes, what the export leaves, and the way back.
//
//   node ../nizam/platform/auditLog/audit-rows.mjs up                           write two rows (see below), remember their numbers
//   node ../nizam/platform/auditLog/audit-rows.mjs export-row [--who ACCOUNT] [--wait s]
//                                                              the newest `audit.export` row the account wrote since `up`
//   node ../nizam/platform/auditLog/audit-rows.mjs csv [--who ACCOUNT]          the CSV of the filter that export row recorded, read through the API
//   node ../nizam/platform/auditLog/audit-rows.mjs down                         delete the rows `up` wrote and the export rows written since
//
// Run by the replay with graphs/bindings/ as the working directory (hence the `../nizam/platform/auditLog/` above). By hand, take the replay lock.
//
// The row. A policy switch is the audited act the page's story is about: PUT /nizam/platform-policies/{key} as the başnazım writes
// `platform_policy.change` in the same transaction (kind "Politika değişikliği", scope Platform, details {key, enabled, was}). `up` switches
// RECORDINGS_NEVER_PUBLIC (the policy that touches nobody's enrolment) to the opposite of what it was and straight back, so the platform ends as it
// began and the log holds two rows. It reads their record numbers back through the audit API (GET /nizam/audit-log?type=POLICY_CHANGE&actor=<the
// başnazım's id>), and writes them with two days (yesterday and tomorrow, Europe/Istanbul) to graphs/.local/made/audit-log.json, which the binding reads as
// {made.number}, {made.older}, {made.from} and {made.to}. The walk asserts those rows by number and never counts the log: it is shared and grows.
//
// The policy itself is put back exactly: `up` records the key's row of platform_policies (enabled, changed_by, changed_at, or "no row" for a key nobody ever
// switched, as the seed has it) and `down` restores it by SQL, as nizam.platform.policies' own helper does (the switches change changed_by and changed_at).
//
// The way back. No route of the API removes a row (audit.controller.ts has none, by design: "Kayıtlar silinemez ve değiştirilemez"), so `down` uses
// SQL, as the app's own e2e does (apps/nizam/e2e/kosk-seed.ts remove()). It deletes only
//   - the two `platform_policy.change` rows `up` recorded, by their numbers and the başnazım's id, and
//   - the `audit.export` rows the başnazım and the account of `--who` wrote since `up` began (the export click of the walk, and `csv`'s own call),
//     found by the time `up` noted. Nothing else is touched. No state file means nothing to do (and nothing is deleted).
// `up` calls `down` first, so a walk that died before its teardown leaves nothing behind.
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
  accountKey,
  call,
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const KEY = "RECORDINGS_NEVER_PUBLIC";
const STATE = resolve(LOCAL, "made", "audit-log.json");
const CHIEF = "SYSTEM_ADMIN";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sql) =>
  query(sql).then((out) =>
    out
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  );

// a day in Europe/Istanbul as YYYY-MM-DD, `shift` days from today
const day = (shift) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(
    new Date(Date.now() + shift * 86_400_000)
  );

function state() {
  if (!existsSync(STATE)) return null;
  return JSON.parse(readFileSync(STATE, "utf8"));
}

async function up() {
  await down(true);
  const chief = subOf(CHIEF);
  const marker = new Date(Date.now() - 5_000).toISOString();
  const [held] = await q(
    `select enabled, changed_by, changed_at::text as changed_at from platform_policies where key = '${KEY}'`
  );
  const policies = (await must(CHIEF, "GET", "/nizam/platform-policies")).body;
  const was =
    (policies.items ?? []).find((p) => p.key === KEY)?.enabled ?? false;
  await must(CHIEF, "PUT", `/nizam/platform-policies/${KEY}`, {
    enabled: !was,
  });
  try {
    await must(CHIEF, "PUT", `/nizam/platform-policies/${KEY}`, {
      enabled: was,
    });
  } catch (e) {
    await call(CHIEF, "PUT", `/nizam/platform-policies/${KEY}`, {
      enabled: was,
    }); // one more try to put it back
    throw e;
  }
  const log = (
    await must(
      CHIEF,
      "GET",
      `/nizam/audit-log?type=POLICY_CHANGE&actor=${chief}`
    )
  ).body;
  const mine = (log.items ?? [])
    .filter(
      (r) => r.action === "platform_policy.change" && r.details?.key === KEY
    )
    .slice(0, 2);
  if (mine.length < 2)
    throw new Fail("the two policy rows are not in the log after the switches");
  mkdirSync(resolve(LOCAL, "made"), { recursive: true });
  const made = {
    number: mine[0].number,
    older: mine[1].number,
    key: KEY,
    was,
    held: held ?? null,
    marker,
    from: day(-1),
    to: day(1),
  };
  writeFileSync(STATE, JSON.stringify(made));
  console.log(`audit-rows up ${made.number} ${made.older} ${KEY} was=${was}`);
}

// the SQL that returns the policy's row to what `up` found: deleted when there was none, else written back column by column (values checked first)
function restoreSql(held) {
  if (held === null || held === undefined)
    return `delete from platform_policies where key = '${KEY}'`;
  if (typeof held.enabled !== "boolean")
    throw new Fail("the state has an enabled that is not true or false");
  const by =
    held.changed_by === null
      ? "null"
      : /^[0-9a-f-]{36}$/i.test(held.changed_by)
        ? `'${held.changed_by}'`
        : null;
  if (by === null) throw new Fail("the state has a changed_by that is no uuid");
  if (
    !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?[+-]\d\d(:?\d\d)?$/.test(
      held.changed_at ?? ""
    )
  )
    throw new Fail("the state has a changed_at it cannot read");
  return `insert into platform_policies (key, enabled, changed_by, changed_at) values ('${KEY}', ${held.enabled}, ${by}, '${held.changed_at}'::timestamptz) on conflict (key) do update set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at`;
}

async function down(quiet = false) {
  const s = state();
  if (!s) {
    if (!quiet) console.log("audit-rows down none");
    return;
  }
  const chief = subOf(CHIEF);
  const rows = await q(
    `delete from audit_log where actor_id = '${chief}' and action = 'platform_policy.change' and seq in (${Number(s.number)}, ${Number(s.older)}) returning seq`
  );
  const marker = String(s.marker).replace(/[^0-9TZ:.+-]/g, "");
  await query(restoreSql(s.held));
  const exports = await q(
    `delete from audit_log where action = 'audit.export' and actor_id in ('${chief}', '${subOf("MEDARIS_NAZIM")}') and created_at >= '${marker}' returning seq`
  );
  rmSync(STATE, { force: true });
  if (!quiet)
    console.log(
      `audit-rows down ${rows.length} policy rows, ${exports.length} export rows`
    );
}

async function lastExport(who, waitSeconds) {
  const s = state();
  if (!s) throw new Fail("no state: `up` has not run");
  const actor = subOf(who);
  const marker = String(s.marker).replace(/[^0-9TZ:.+-]/g, "");
  const until = Date.now() + waitSeconds * 1000;
  for (;;) {
    const [row] = await q(
      `select seq, details from audit_log where action = 'audit.export' and actor_id = '${actor}' and created_at >= '${marker}' order by created_at desc limit 1`
    );
    if (row) return row;
    if (Date.now() >= until)
      throw new Fail(
        `no audit.export row of ${accountKey(who)} since the walk began`
      );
    await sleep(500);
  }
}

async function exportRow(who, wait) {
  const row = await lastExport(who, wait);
  const f = row.details.filter ?? {};
  console.log(
    `export-row rows=${row.details.rows} type=${f.type ?? "all"} actor=${f.actor ?? "all"} scope=${f.scope ?? "all"}`
  );
}

async function csv(who) {
  const s = state();
  const row = await lastExport(who, 5);
  const f = row.details.filter ?? {};
  const params = new URLSearchParams(f).toString();
  const r = await must(
    who,
    "GET",
    `/nizam/audit-log/export${params ? `?${params}` : ""}`
  );
  const text = String(r.text ?? r.body ?? "").replace(/^﻿/, "");
  const lines = text.split("\r\n").filter(Boolean);
  if (lines[0] !== "no,time,actor,actor_role,type,action,scope_kind,scope_name")
    throw new Fail(`the CSV header is ${lines[0]}`);
  const data = lines.length - 1;
  if (data < Number(row.details.rows))
    throw new Fail(
      `the CSV holds ${data} rows, the export row said ${row.details.rows}`
    );
  const capped = data >= 10_000;
  const has = lines.some(
    (l) =>
      l.startsWith(`${s.number},`) &&
      l.includes(",POLICY_CHANGE,platform_policy.change,PLATFORM,")
  );
  if (!has && !capped && (!f.type || f.type === "POLICY_CHANGE") && !f.from)
    throw new Fail(`the CSV has no line for row ${s.number}`);
  console.log(`csv ok rows=${data} has=${has}`);
}

run("audit-rows", async () => {
  const [cmd, ...args] = process.argv.slice(2);
  const o = options(args, { values: ["who", "wait"] });
  if (cmd === "up") return up();
  if (cmd === "down") return down();
  if (cmd === "export-row")
    return exportRow(o.who ?? CHIEF, Number(o.wait ?? 15));
  if (cmd === "csv") return csv(o.who ?? CHIEF);
  throw new Fail(
    "usage: audit-rows.mjs up | down | export-row [--who A] [--wait s] | csv [--who A]",
    2
  );
});
