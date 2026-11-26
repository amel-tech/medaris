#!/usr/bin/env node
// The data of nizam.kosks.nazims' walks: a köşk of the walk's own, made through tedrisat's HTTP API as the başnazım, with a spare talebe
// account as its nazım, and taken away again by its short name. The walks add two more spare accounts to it as nazımları, so the seed's
// own köşks (Süleymaniye, Kubbealtı) are never given or loses a nazım (other flows read them). Run from graphs/bindings/ (the replay's
// working directory):
//
//   node ../nizam/kosks/nazims/nazims-data.mjs up [--passive]
//   node ../nizam/kosks/nazims/nazims-data.mjs down
//   node ../nizam/kosks/nazims/nazims-data.mjs held <ACCOUNT> [--ends none|future] [--absent]
//   node ../nizam/kosks/nazims/nazims-data.mjs count <n>
//   node ../nizam/kosks/nazims/nazims-data.mjs status <ACTIVE|PASSIVE>
//
// up       Opens the köşk "Nazımlar Deneme Köşkü" (short name deneme-nznazims, unlisted) as the başnazım with APPLICANT_E as its only
//          nazım (POST /kosks; the başnazım is never one of them). With --passive it is then taken out of service the way the başnazım's
//          own page does: GET /kosks/:id/deactivation-preview for the confirmation, POST /kosks/:id/deactivate with it, which revokes
//          APPLICANT_E's post and sets passive_since, so the list is empty and the köşk is PASSIVE. A köşk of that short name that a walk
//          left behind is removed first. Prints one line, `nznazims up kosk=<id> passive=<true|false>`, and writes graphs/.local/
//          nznazims.json, which the binding reads as the data source `nz` ({nz.kosk}, {nz.title}, {nz.first.name}, {nz.add.email},
//          {nz.chiefName}, {nz.today}, {nz.future}, {nz.futureIso} ...): the köşk's id and name in the cases the page puts them in, the
//          three accounts' names and addresses (GET /me as each, which also gives tedrisat its users row), the day the walk starts as the
//          page writes it, and the day an end is typed with (30 days ahead, 12:00 in Europe/Istanbul, as kosks.e2e.ts#13), as the
//          field takes it, as the API answers it and as the list writes it.
// down     Deletes every köşk with that short name (DELETE /kosks/:id as the başnazım, which takes the köşk's role assignments, the three
//          accounts' posts included, with it in one transaction) and the file. Safe to run twice: it says `removed 0` the second time.
// held     Fails unless the account holds a post in the köşk now (GET /kosks/:id/nazims as the başnazım); --ends none checks that it has
//          no end, --ends future that it ends at {nz.futureIso}; --absent fails when the account does hold one. Prints `held <KEY> ...`.
// count    Fails unless the köşk has exactly <n> live nazımları. Prints `count <n>`.
// status   Fails unless the directory (GET /kosks/directory?q=<handle>, as the başnazım) gives the köşk that status. Prints `status <S>`.
//
// The accounts are fixed: APPLICANT_E is the köşk's first nazım (the nazım who reads the list, "Siz"), APPLICANT_D and APPLICANT_G are the
// people the başnazım adds. Nothing here touches the seeded accounts. What it cannot undo: the audit rows (kosk.create, kosk.deactivate,
// kosk.nazim.add, user.lookup, kosk.delete), which the API has no way to remove, and the revoked posts' history that the delete takes away
// with the köşk. Both parts of `up` and `down` are safe to run again, so a walk that died leaves nothing the next one trips on. Run it by
// hand under the replay lock when walks are running.
//
// NOT RUN: the owner's word is that nothing writes to the stack before the walk phase. Every call is read from the controllers
// (kosk.controller.ts:310, 367; kosk-admin.controller.ts:255, 277, 297, 327) and follows helpers/make-kosk.mjs
// and graphs/nizam/madrasahs/passivate/passivate-data.mjs; `node --check` reads it, nothing more.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const CHIEF = "SYSTEM_ADMIN";
const HANDLE = "deneme-nznazims";
const TITLE = "Nazımlar Deneme Köşkü";
const FIRST = "APPLICANT_E";
const ADD = "APPLICANT_D";
const MORE = "APPLICANT_G";
const ZONE = "Europe/Istanbul";
const FILE = resolve(LOCAL, "nznazims.json");

const usage =
  "usage: nazims-data.mjs up [--passive] | down | held <ACCOUNT> [--ends none|future] [--absent] | count <n> | status <ACTIVE|PASSIVE>";

// "Nazımlar Deneme Köşkü’nün": a name that ends in "Köşkü" takes ’nün and ’nü (admin-present.ts:401-412, koskCase)
const caseOf = (name, kind) =>
  /köşkü$/iu.test(name)
    ? `${name}${kind === "genitive" ? "’nün" : "’nü"}`
    : /köşk$/iu.test(name)
      ? `${name}${kind === "genitive" ? "’ün" : "’ü"}`
      : `${name} ${kind === "genitive" ? "köşkünün" : "köşkünü"}`;

// a day as nazims-view.tsx writes it ("16 Kasım 2026": grantedOn, termLabel), in the page's zone
const label = (date) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
// the calendar day in the page's zone, as YYYY-MM-DD
const dayOf = (date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE }).format(date);

const person = async (key) => ({
  key,
  sub: subOf(key),
  name: await nameOf(key),
  email: env()[`E2E_${key}_EMAIL`],
});

/** The köşks of that short name, as the directory the başnazım reads lists them. */
async function withHandle() {
  const found = (
    await must(
      CHIEF,
      "GET",
      `/kosks/directory?q=${encodeURIComponent(HANDLE)}&limit=50`
    )
  ).body;
  return (found.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === HANDLE
  );
}

async function remove() {
  const same = await withHandle();
  for (const k of same) await must(CHIEF, "DELETE", `/kosks/${k.id}`);
  rmSync(FILE, { force: true });
  return same.length;
}

function made() {
  if (!existsSync(FILE))
    throw new Fail(
      "no köşk recorded in graphs/.local/nznazims.json: run `up` first"
    );
  return JSON.parse(readFileSync(FILE, "utf8"));
}

async function up({ passive }) {
  await remove(); // a köşk of that short name that a walk left behind goes first
  const [first, add, more, chief] = [
    await person(FIRST),
    await person(ADD),
    await person(MORE),
    await person(CHIEF),
  ];
  const created = (
    await must(CHIEF, "POST", "/kosks", {
      name: TITLE,
      handle: HANDLE,
      isPrivate: true,
      managerUserIds: [first.sub],
    })
  ).body;
  if (!created?.id) throw new Fail("POST /kosks answered no id");
  const now = new Date();
  const futureDay = dayOf(new Date(now.getTime() + 30 * 24 * 3600 * 1000));
  const futureIso = new Date(`${futureDay}T12:00:00+03:00`).toISOString();
  const record = {
    tag: "nznazims",
    kosk: created.id,
    handle: HANDLE,
    title: TITLE,
    genitive: caseOf(TITLE, "genitive"),
    accusative: caseOf(TITLE, "accusative"),
    passive: Boolean(passive),
    first,
    add,
    more,
    chiefName: chief.name,
    chiefSub: chief.sub,
    today: label(now),
    future: `${futureDay}T12:00`,
    futureIso,
    futureLabel: label(new Date(futureIso)),
    past: "2020-01-01T12:00",
  };
  // the file is written the moment the köşk exists, so a crash half way is still removable by `down`
  mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  if (passive) {
    const preview = (
      await must(CHIEF, "GET", `/kosks/${created.id}/deactivation-preview`)
    ).body;
    if (!preview?.confirmation)
      throw new Fail("the deactivation preview gave no confirmation");
    await must(CHIEF, "POST", `/kosks/${created.id}/deactivate`, {
      confirmation: preview.confirmation,
    });
  }
  return `nznazims up kosk=${created.id} passive=${Boolean(passive)}`;
}

const rows = async () =>
  (await must(CHIEF, "GET", `/kosks/${made().kosk}/nazims`)).body;

async function held(account, { ends, absent }) {
  const key = accountKey(account);
  const sub = subOf(account).toLowerCase();
  const row = (await rows()).find((r) => r.user?.id?.toLowerCase() === sub);
  if (absent) {
    if (row)
      throw new Fail(`held ${key}: is a nazım of the köşk and should not be`);
    return `held ${key} absent`;
  }
  if (!row) throw new Fail(`held ${key}: is not a nazım of the köşk`);
  if (ends === "none" && row.endsAt !== null)
    throw new Fail(`held ${key}: ends ${row.endsAt}, wanted no end`);
  if (ends === "future" && row.endsAt !== made().futureIso)
    throw new Fail(
      `held ${key}: ends ${row.endsAt}, wanted ${made().futureIso}`
    );
  return `held ${key} ends=${row.endsAt ? "future" : "none"} by=${row.grantedByRole}`;
}

async function count(wanted) {
  const now = (await rows()).length;
  if (now !== Number(wanted))
    throw new Fail(`count: the köşk has ${now} nazımları, wanted ${wanted}`);
  return `count ${now}`;
}

async function status(wanted) {
  const [k] = await withHandle();
  if (!k) throw new Fail("status: no köşk with that short name");
  if (k.status !== wanted)
    throw new Fail(`status: the köşk is ${k.status}, wanted ${wanted}`);
  return `status ${k.status}`;
}

run("nazims-data", async () => {
  const { rest, ends, passive, absent } = options(process.argv.slice(2), {
    values: ["ends"],
    flags: ["passive", "absent"],
  });
  const [verb, arg, ...more] = rest;
  if (!verb || more.length) throw new Fail(usage, 2);
  if (verb === "up" && !arg) console.log(await up({ passive }));
  else if (verb === "down" && !arg)
    console.log(`nznazims down removed ${await remove()}`);
  else if (verb === "held" && arg)
    console.log(await held(arg, { ends, absent }));
  else if (verb === "count" && arg) console.log(await count(arg));
  else if (verb === "status" && arg) console.log(await status(arg));
  else throw new Fail(usage, 2);
});
