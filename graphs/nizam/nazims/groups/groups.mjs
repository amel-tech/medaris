#!/usr/bin/env node
// The walk data of nizam.nazims.groups, made and removed through tedrisat's HTTP API as the başnazım (SYSTEM_ADMIN): platform permission
// groups and course groups whose names start with "Deneme grubu yonetim", and the holder of one of them. It is the binding's `setup`,
// `teardown` and `effects` (`run` commands: no page exists then): `node groups.mjs up|down|note|verify|show ...`.
//
//   up     [--make 'key|Name|code,code;key|Name|code,code'] [--hold key=ACCOUNT]
//          first clears what a walk that died could have left (every group whose name starts with the prefix, with "revoke" where someone
//          holds it), then makes each group (the scope is PLATFORM when its codes start with "platform.", else ALL_COURSES) and, for
//          --hold, gives the group to the account, which must already be a Medaris nazımı (the walk's setup runs
//          ../nizam/home/medarisNazimCut/nazim.mjs up first). Writes graphs/.local/made/nizam-groups.json: one key for each group with its id
//          (`{made.a}` in the binding) and, under `_`, what `verify` needs. Prints `ready: N groups`, plus `, held by ACCOUNT`.
//   down   the clearing alone. Prints `restored`. The holder's seat is taken away by nazim.mjs down, not here.
//   note   keep|revoke   writes the answer the walk chose in the question (the flow's effect chosenKeep or chosenRevoke runs it).
//   verify created --name N --codes code,code   the group N exists, made with exactly those codes. Prints `ok: created ...`.
//          saved                                the page's own API still answers and lists the walk's groups. Prints `ok: saved ...`.
//          asked [--holder ACCOUNT]             after a save or a delete that asked: the holder no longer holds the walk's group and
//                                               has what the noted answer promises: 'keep' leaves the group's old codes as single
//                                               permissions, 'revoke' leaves nothing. Prints `ok: kept` or `ok: revoked`.
//          deleted                              prints how many of the walk's groups are left. Prints `ok: left N`.
//   interfere none|gone|taken|hold [--name N] [--account A]   what another person does while a call is held (the binding's `before` of an
//          invoking state, so the server meets a world that changed after the page was read): `gone` deletes every group of the walk,
//          `taken` makes a group named N (a prefixed name) when none has it, `hold` gives the newest group of the walk to the account
//          (a Medaris nazımı already), so the page's count of its users is out of date. `none` does nothing. Prints `interfered <what>`.
//   show   the same reading as `verify saved`, always exits 0.
//
// What it touches: groups named "Deneme grubu yonetim ..." (ASCII only, so that the browser's Turkish lower-casing and the database's
// lower() mean the same) and the group grants of the --hold account, a spare talebe made a Medaris nazımı for the walk (APPLICANT_G in the
// binding). It never reads or changes the seed's own Medaris nazımı, and no group whose name does not start with the prefix. No SQL is used.
// The audit rows (permission_group.create, update, delete) stay: the API has no way to remove them.
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

const PREFIX = "Deneme grubu yonetim";
const CHIEF = "SYSTEM_ADMIN";
const RECORD = resolve(LOCAL, "made", "nizam-groups.json"); // graphs/.local is git-ignored

const mine = (g) => g.name.toLowerCase().startsWith(PREFIX.toLowerCase());
const sameSet = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x));
const csv = (codes) => (codes.length ? codes.join(",") : "none");

const groups = async () =>
  (await must(CHIEF, "GET", "/nizam/permission-groups")).body;
const read = () =>
  existsSync(RECORD)
    ? JSON.parse(readFileSync(RECORD, "utf8"))
    : { _: { groups: {}, hold: null, policy: null } };

/** Deletes every group of the walk, with "revoke" where somebody holds it. */
async function clear() {
  for (const g of (await groups()).filter(mine)) {
    await must(
      CHIEF,
      "DELETE",
      `/nizam/permission-groups/${g.id}`,
      g.userCount > 0 ? { usersPolicy: "revoke" } : {}
    );
  }
}

const parts = (text, sep) =>
  (text ?? "")
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

async function up(o) {
  await clear();
  const record = { _: { groups: {}, hold: null, policy: null } };
  for (const entry of parts(o.make, ";")) {
    const [key, name, codeText] = entry.split("|").map((x) => x.trim());
    if (!key || !name || !codeText)
      throw new Fail(`'${entry}' is not key|Name|code,code`, 2);
    if (!mine({ name }))
      throw new Fail(
        `a group of the walk is named '${PREFIX} ...', not '${name}'`,
        2
      );
    const permissions = codeText.split(",").map((c) => c.trim());
    const scope = permissions.every((c) => c.startsWith("platform."))
      ? "PLATFORM"
      : "ALL_COURSES";
    const made = (
      await must(CHIEF, "POST", "/nizam/permission-groups", {
        name,
        scope,
        permissions,
      })
    ).body;
    record[key] = made.id;
    record._.groups[key] = {
      id: made.id,
      name,
      scope,
      codes: made.permissions,
    };
  }
  let held = "";
  if (o.hold) {
    const [key, account] = o.hold.split("=");
    const group = record._.groups[key];
    if (!group || !account)
      throw new Fail(
        `--hold wants key=ACCOUNT with a key --make made, not '${o.hold}'`,
        2
      );
    // the account must be a Medaris nazımı already: the grant replaces the group and the single permissions of that seat
    await must(CHIEF, "PUT", `/nizam/medaris-nazims/${subOf(account)}/grants`, {
      groupId: group.id,
      permissions: [],
      expiresAt: null,
    });
    record._.hold = { key, account, sub: subOf(account) };
    held = `, held by ${account}`;
  }
  mkdirSync(resolve(LOCAL, "made"), { recursive: true });
  writeFileSync(RECORD, JSON.stringify(record, null, 2));
  console.log(`ready: ${Object.keys(record._.groups).length} groups${held}`);
}

async function note(policy) {
  if (policy !== "keep" && policy !== "revoke")
    throw new Fail("note wants keep or revoke", 2);
  const record = read();
  record._.policy = policy;
  mkdirSync(resolve(LOCAL, "made"), { recursive: true });
  writeFileSync(RECORD, JSON.stringify(record, null, 2));
  console.log(`noted ${policy}`);
}

async function verify(what, o) {
  const live = (await groups()).filter(mine);
  if (what === "created") {
    if (!o.name || !o.codes)
      throw new Fail("verify created wants --name and --codes", 2);
    const g = live.find((x) => x.name === o.name);
    if (!g)
      throw new Fail(
        `no group named '${o.name}' (live: ${live.map((x) => x.name).join("; ") || "none"})`
      );
    const want = o.codes.split(",").map((c) => c.trim());
    if (!sameSet(g.permissions, want))
      throw new Fail(
        `'${o.name}' holds ${csv(g.permissions)}, wanted ${csv(want)}`
      );
    console.log(`ok: created ${g.name} ${g.scope} ${csv(g.permissions)}`);
  } else if (what === "saved" || what === "deleted") {
    console.log(
      what === "saved"
        ? `ok: saved groups=${live.length}`
        : `ok: left ${live.length}`
    );
  } else if (what === "asked") {
    const record = read();
    const policy = record._.policy;
    const hold = record._.hold;
    const account = o.holder ?? hold?.account;
    if (!policy)
      throw new Fail(
        "no answer was noted: the question's choice never ran `note`"
      );
    if (!account || !hold)
      throw new Fail("the walk made no holder (up --hold)");
    const rows = (await must(CHIEF, "GET", "/nizam/medaris-nazims")).body;
    const row = rows.find((r) => r.user?.id === subOf(account));
    if (!row) throw new Fail(`${account} is no longer a Medaris nazımı`);
    const old = record._.groups[hold.key]?.codes ?? [];
    const singles = (row.permissions ?? []).map((p) => p.code);
    const still = (row.groups ?? []).some((g) =>
      Object.values(record._.groups).some((m) => m.id === g.id)
    );
    if (still)
      throw new Fail(
        `${account} still holds the group after a changed or deleted group that asked`
      );
    if (policy === "keep" && !sameSet(singles, old))
      throw new Fail(
        `keep: ${account} holds ${csv(singles)} as single permissions, the group had ${csv(old)}`
      );
    if (policy === "revoke" && singles.length > 0)
      throw new Fail(`revoke: ${account} still holds ${csv(singles)}`);
    console.log(
      `ok: ${policy === "keep" ? "kept" : "revoked"} ${csv(singles)}`
    );
  } else {
    throw new Fail(`unknown verify ${what}`, 2);
  }
}

async function interfere(what, o) {
  if (what === "none") {
    console.log("interfered none");
  } else if (what === "gone") {
    await clear();
    console.log("interfered gone");
  } else if (what === "taken") {
    if (!o.name || !mine({ name: o.name }))
      throw new Fail(`taken wants --name '${PREFIX} ...'`, 2);
    if (
      !(await groups()).some(
        (g) => g.name.toLowerCase() === o.name.toLowerCase()
      )
    ) {
      await must(CHIEF, "POST", "/nizam/permission-groups", {
        name: o.name,
        scope: "PLATFORM",
        permissions: ["platform.audit_read"],
      });
    }
    console.log(`interfered taken ${o.name}`);
  } else if (what === "hold") {
    if (!o.account) throw new Fail("hold wants --account", 2);
    const live = (await groups()).filter(mine);
    const g = live[live.length - 1];
    if (!g) throw new Fail("no group of the walk to give");
    await must(
      CHIEF,
      "PUT",
      `/nizam/medaris-nazims/${subOf(o.account)}/grants`,
      { groupId: g.id, permissions: [], expiresAt: null }
    );
    console.log(`interfered hold ${g.name}`);
  } else {
    throw new Fail(`unknown interfere ${what}`, 2);
  }
}

run("groups", async () => {
  const { rest, ...o } = options(process.argv.slice(2), {
    values: ["make", "hold", "holder", "name", "codes", "account"],
  });
  const [command, what] = rest;
  if (!command)
    throw new Fail("usage: groups.mjs up|down|note|verify|show [options]", 2);
  if (command === "up") return up(o);
  if (command === "down") {
    await clear();
    console.log("restored");
    return;
  }
  if (command === "note") return note(what);
  if (command === "verify") return verify(what, o);
  if (command === "interfere") return interfere(what, o);
  if (command === "show") {
    const live = (await groups()).filter(mine);
    console.log(
      `ok: groups=${live.length} [${live.map((g) => `${g.name} (codes=${csv(g.permissions)}; users=${g.userCount})`).join("; ")}]`
    );
    return;
  }
  throw new Fail(`unknown command ${command}`, 2);
});
