// The walk data of nazar.nazirs.groups, made and removed through tedrisat's HTTP API as the medrese's başmüderris: permission groups
// of "Hadis ve Siyer Medresesi", and (for the scenarios with a used group) one spare talebe account made a nazır of the medrese that
// holds a group. It is the binding's `setup`, `teardown` and `effects`: `node groups.mjs up|down|verify|show ...`.
//
//   up     --madrasah <id> [--make 'NAME=code,code;NAME=code'] [--hold 'NAME=ACCOUNT']
//          first clears what a walk that died could have left (every group whose name starts with "Gezinti grup", and the holder as a
//          nazır), then makes the groups and, for --hold, appoints the account a nazır and gives it the named group. Prints
//          `ready: N groups`, plus `, M held` when a group was given away.
//   down   --madrasah <id> [--hold ACCOUNT]       the clearing alone. Prints `restored`.
//   verify --madrasah <id> [--holder ACCOUNT|none]    reads what the API holds and prints `ok: ...`, or fails with `inconsistent: ...`.
//          Without a holder: the live groups of the walk and how many people hold them. With one: whether the account still holds the
//          group (`held`), kept the group's old codes as single permissions (`kept`) or lost them (`revoked`), which is what the API
//          promises of "İzinleri korusunlar" and "İzinleri kaybetsinler" (madrasah-permission.service.ts updateGroup, deleteGroup).
//   show   same reading, always exits 0.
//
// What it touches: groups named "Gezinti grup ..." in the seed's medrese and the nazır seat of the --hold account (a spare talebe
// account, APPLICANT_D in the binding). It never reads or changes the seed's own medrese nazır (MEDRESE_NAZIR), the seed's courses
// or any group whose name does not start with the prefix. Group names are plain ASCII so that the API's case-insensitive name check
// (lower(name)) is the same in any database collation. Nothing secret is printed: the account's token comes from lib.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const PREFIX = "Gezinti grup";
const HEAD = "BASMUDERRIS"; // the başmüderris of the seed's medrese (helpers/lib.mjs maps it to MEDRESE_BASMUDERRIS)
const RECORD = resolve(LOCAL, "made", "nazirs-groups.json"); // what `up` made, for `verify` (graphs/.local is git-ignored)

const mine = (g) => g.name.toLowerCase().startsWith(PREFIX.toLowerCase());
const sameSet = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x));

async function groupsOf(madrasah) {
  return (await must(HEAD, "GET", `/madrasahs/${madrasah}/permission-groups`))
    .body;
}

/** The holder as a nazır of the medrese gives nothing, so the dismissal has no decisions; 404 is "not a nazır". */
async function dismiss(madrasah, account) {
  await must(
    HEAD,
    "DELETE",
    `/madrasahs/${madrasah}/nazirs/${subOf(account)}`,
    { decisions: [] },
    [404]
  );
}

/** Deletes every group of the walk (with "revoke" where someone holds it) and takes the holder out of the medrese. */
async function clear(madrasah, holder) {
  if (holder) await dismiss(madrasah, holder).catch(() => {}); // a seat that is not there is the answer wanted
  for (const g of (await groupsOf(madrasah)).filter(mine)) {
    await must(
      HEAD,
      "DELETE",
      `/madrasahs/${madrasah}/permission-groups/${g.id}`,
      g.userCount > 0 ? { usersPolicy: "revoke" } : {}
    );
  }
  if (holder) await dismiss(madrasah, holder);
}

const pairs = (text) =>
  (text ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const at = x.lastIndexOf("=");
      if (at < 1) throw new Fail(`'${x}' is not NAME=value`, 2);
      return [x.slice(0, at).trim(), x.slice(at + 1).trim()];
    });

async function up(o) {
  const madrasah = o.madrasah;
  const hold = pairs(o.hold)[0];
  await clear(madrasah, hold?.[1]);
  const made = [];
  for (const [name, codes] of pairs(o.make)) {
    if (!mine({ name }))
      throw new Fail(
        `a group of the walk is named '${PREFIX} ...', not '${name}'`,
        2
      );
    const permissions = codes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const r = await must(
      HEAD,
      "POST",
      `/madrasahs/${madrasah}/permission-groups`,
      { name, scope: "MADRASAH", permissions }
    );
    made.push({ id: r.body.id, name, codes: r.body.permissions });
  }
  let held = 0;
  if (hold) {
    const [name, account] = hold;
    const group = made.find((g) => g.name === name);
    if (!group)
      throw new Fail(`--hold names '${name}', which --make did not make`, 2);
    await must(account, "GET", "/me"); // the account's row in tedrisat exists once it has called the API
    await must(HEAD, "POST", `/madrasahs/${madrasah}/nazirs/${subOf(account)}`);
    await must(
      HEAD,
      "PUT",
      `/madrasahs/${madrasah}/nazirs/${subOf(account)}/permissions`,
      {
        groupId: group.id,
        permissions: [],
        courseIds: null,
        expiresAt: null,
      }
    );
    held = 1;
  }
  mkdirSync(resolve(LOCAL, "made"), { recursive: true });
  writeFileSync(RECORD, JSON.stringify({ madrasah, made }, null, 2));
  console.log(`ready: ${made.length} groups${held ? `, ${held} held` : ""}`);
}

async function down(o) {
  await clear(o.madrasah, o.hold);
  console.log("restored");
}

/** What the API holds now, as one line, and whether it is a state the API promises. */
async function read(o) {
  const madrasah = o.madrasah;
  const live = (await groupsOf(madrasah)).filter(mine);
  const record = existsSync(RECORD)
    ? JSON.parse(readFileSync(RECORD, "utf8"))
    : { made: [] };
  const names = live
    .map(
      (g) =>
        `${g.name} (codes=${g.permissions.join(",")}; holders=${g.userCount})`
    )
    .join("; ");
  if (!o.holder || o.holder === "none") {
    return {
      ok: true,
      line: `ok: groups=${live.length} holders=${live.reduce((n, g) => n + g.userCount, 0)} [${names}]`,
    };
  }
  const have = (
    await must(
      HEAD,
      "GET",
      `/madrasahs/${madrasah}/nazirs/${subOf(o.holder)}/permissions`
    )
  ).body;
  const singles = have.permissions ?? [];
  const states = [];
  for (const g of record.made) {
    const now = live.find((l) => l.id === g.id);
    let state;
    if (now && have.groupId === g.id) state = "held";
    else if (
      have.groupId !== null &&
      have.groupId !== undefined &&
      have.groupId !== g.id
    )
      state = "other";
    else if (sameSet(singles, g.codes)) state = "kept";
    else if (singles.length === 0) state = "revoked";
    else state = "inconsistent";
    states.push(`${g.name}: ${state}${now ? "" : " (deleted)"}`);
    if (state === "inconsistent" || state === "other") {
      return {
        ok: false,
        line: `inconsistent: ${states.join("; ")}; singles=${singles.join(",")}`,
      };
    }
  }
  return { ok: true, line: `ok: ${states.join("; ")}; groups=${live.length}` };
}

run("groups", async () => {
  const { rest, ...o } = options(process.argv.slice(2), {
    values: ["madrasah", "make", "hold", "holder"],
  });
  const [command] = rest;
  if (!command || !o.madrasah) {
    throw new Fail(
      "usage: groups.mjs up|down|verify|show --madrasah <id> [--make 'NAME=codes;...'] [--hold 'NAME=ACCOUNT'|ACCOUNT] [--holder ACCOUNT]",
      2
    );
  }
  if (command === "up") return up(o);
  if (command === "down") return down(o);
  if (command === "verify" || command === "show") {
    const r = await read(o);
    console.log(r.line);
    if (!r.ok && command === "verify") throw new Fail(r.line);
    return;
  }
  throw new Fail(`unknown command ${command}`, 2);
});
