// The walk data of nizam.applications.decide: köşk applications, filed through tedrisat's own route (POST /kosk-applications, the call
// the form of tedris.discover.applyForKosk makes) by the spare talebe who "send" them, and taken away again. It is the `setup` and
// `teardown` of ./binding*.yaml: `node applications.mjs up|down|status ...`, run from graphs/bindings/ (the replay's working directory).
//
//   up   <tag> <kind>:<ACCOUNT> [<kind>:<ACCOUNT> ...]   removes what an earlier walk left, then files each kind as that account;
//                                                        prints one JSON line {"tag":..,"<kind>":{"id","name","applicant","email"}},
//                                                        and writes the same to graphs/.local/made/<tag>.json (a binding's data source)
//   down <tag>                                           removes every köşk the walk's applications opened (by short name), the notices
//                                                        their answers sent, the applications, and the made file; prints
//                                                        `applications down <tag> <n> applications, <n> kosks, <n> notices`
//   status <kind>:<ACCOUNT> ...                          prints `<kind> <ACCOUNT> <STATUS>|none` of the application each account filed
//                                                        (for an `effects` check; the account's applicant id is the filter)
//
// KINDS are fixed data: a name, a field, a short description and why, the telephone (or none) and the short name the walk gives
// the köşk when it opens one from that application. The names are invented and belong to this flow only, so `down` can find its
// rows by (name, applicant) and never touches another flow's. ACCOUNT is the role key of graphs/.local/accounts.env or the name a
// binding gives it (applicantC); only the spare applicants C, D, E and G are accepted, so a seeded person is never an applicant here.
//
// What it cannot undo: the audit rows (kosk_application.contact_read, .approve, .reject, kosk.create, the köşk's removal): no route
// removes them, and nothing depends on them. The notices an answer sends the applicant (`KOSK_APPLICATION_RESULT`) are deleted by SQL,
// since no route removes a notification; they are scoped to these applicants and these köşk names. Nothing secret is printed.
// Data-changing: run it under the replay lock when you run it by hand.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  call,
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const APPLICANTS = ["APPLICANT_C", "APPLICANT_D", "APPLICANT_E", "APPLICANT_G"];
const usage =
  "usage: applications.mjs up <tag> <kind>:<ACCOUNT>... | down <tag> | status <kind>:<ACCOUNT>...";

const SUMMARY = "Metinleri şerhleriyle okuyan, ders vermeye hazır bir köşk.";
const REASON =
  "Halkamız yüz yüze yürüyor; ders verecek hocalarımız ve okunacak metinlerimiz belli.";
// the köşk of an application is found again by its short name, which the walk types in the form it opens ("Kısa ad")
const KINDS = {
  open: {
    name: "Örnek Kelâm Köşkü",
    field: "AQEEDAH_KALAM",
    phone: "+90 532 000 00 01",
    handle: "ornek-kelam",
  },
  reject: {
    name: "Örnek Mantık Köşkü",
    field: "LOGIC",
    phone: "+90 532 000 00 02",
    handle: "ornek-mantik",
  },
  meetA: {
    name: "Örnek Tefsir Köşkü",
    field: "TAFSIR",
    phone: "+90 532 000 00 03",
    handle: "ornek-tefsir",
  },
  meetR: {
    name: "Örnek Siyer Köşkü",
    field: "SEERAH",
    phone: "+90 532 000 00 04",
    handle: "ornek-siyer",
  },
  bare: {
    name: "Örnek Belâgat Köşkü",
    field: "RHETORIC",
    phone: null,
    handle: "ornek-belagat",
  },
  forbid: {
    name: "Örnek Fıkıh Köşkü",
    field: "FIQH",
    phone: "+90 532 000 00 05",
    handle: "ornek-fikih",
  },
};

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rowsOf = (out) => JSON.parse(out.trim().split("\n")[0] || "{}").rows ?? 0;
const fileOf = (tag) => resolve(MADE, `${tag}.json`);

function pairs(args) {
  if (!args.length) throw new Fail(usage, 2);
  return args.map((a) => {
    const [kind, who, ...more] = a.split(":");
    if (!KINDS[kind] || !who || more.length)
      throw new Fail(
        `${a}: want <kind>:<ACCOUNT>, kind one of ${Object.keys(KINDS).join(", ")}`,
        2
      );
    const key = accountKey(who);
    if (!APPLICANTS.includes(key))
      throw new Fail(
        `${key} is not one of the spare applicants this flow files as (${APPLICANTS.join(", ")})`,
        2
      );
    return { kind, key };
  });
}

/** Every köşk whose short name a walk of this flow may have given, removed as the başnazım (none is fine). */
async function removeKosks() {
  let n = 0;
  for (const { handle } of Object.values(KINDS)) {
    const found = (
      await must(
        "SYSTEM_ADMIN",
        "GET",
        `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
      )
    ).body;
    for (const k of (found.items ?? []).filter(
      (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === handle
    )) {
      await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
      n++;
    }
  }
  return n;
}

async function down(tag) {
  const names = Object.values(KINDS)
    .map((k) => lit(k.name))
    .join(",");
  const subs = APPLICANTS.map((a) => lit(subOf(a))).join(",");
  const kosks = await removeKosks();
  const notices = rowsOf(
    await query(
      `delete from notifications where type = 'KOSK_APPLICATION_RESULT' and user_id in (${subs}) and params->>'koskName' in (${names})`
    )
  );
  const applications = rowsOf(
    await query(
      `delete from kosk_applications where name in (${names}) and applicant_id in (${subs})`
    )
  );
  rmSync(fileOf(tag), { force: true });
  console.log(
    `applications down ${tag} ${applications} applications, ${kosks} kosks, ${notices} notices`
  );
}

run("applications", async () => {
  const [verb, tag, ...rest] = process.argv.slice(2);
  if (verb === "status") {
    for (const { kind, key } of pairs([tag, ...rest].filter(Boolean))) {
      const out = await query(
        `select status from kosk_applications where name = ${lit(KINDS[kind].name)} and applicant_id = ${lit(subOf(key))}`
      );
      const row = out.trim().split("\n")[0];
      console.log(`${kind} ${key} ${row ? JSON.parse(row).status : "none"}`);
    }
    return;
  }
  if (!tag || (verb !== "up" && verb !== "down")) throw new Fail(usage, 2);
  if (verb === "down") {
    if (rest.length) throw new Fail(usage, 2);
    return down(tag);
  }
  const wanted = pairs(rest);
  await down(tag); // what an earlier walk left, so a crashed one leaves nothing to be refused or counted
  mkdirSync(MADE, { recursive: true });
  const made = { tag };
  for (const { kind, key } of wanted) {
    const k = KINDS[kind];
    const email = env()[`E2E_${key}_EMAIL`];
    const r = await call(key, "POST", "/kosk-applications", {
      name: k.name,
      field: k.field,
      summary: SUMMARY,
      reason: REASON,
      email,
      ...(k.phone ? { phone: k.phone } : {}),
    });
    if (r.status !== 201)
      throw new Fail(
        `${key} POST /kosk-applications: HTTP ${r.status} ${r.body?.code ?? ""}`
      );
    made[kind] = {
      id: r.body.id,
      name: k.name,
      field: k.field,
      handle: k.handle,
      applicant: await nameOf(key),
      email,
      phone: k.phone ?? "",
    };
  }
  writeFileSync(fileOf(tag), JSON.stringify(made, null, 2));
  console.log(JSON.stringify(made));
});
