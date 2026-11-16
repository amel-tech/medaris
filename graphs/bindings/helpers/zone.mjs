// The time zone of an account, kept and put back, for the walks of nazar.account.settings and nizam.account.settings. The walks choose
// zones on Hesap, which writes users.time_zone through PATCH /me (the stack's accounts hold none: GET /me answers timeZone null, and the
// page then shows İstanbul), so a walk's `setup` keeps what the account holds, sets İstanbul, and its `teardown` puts the kept value back,
// exactly as it was (a zone, or null). It is the binding's `setup`, `teardown` and `effects`: `node helpers/zone.mjs <command> <ACCOUNT>
// [zone]`, run from graphs/bindings/.
//
//   keep    <ACCOUNT>          writes the zone the account holds (or `null`) to graphs/.local/made/zone-<KEY>.json,
//                              unless that file is already there (a walk that crashed left it: the first value is the true one)
//   set     <ACCOUNT> <zone>   PATCH /me { timeZone }; `null` clears the zone
//   get     <ACCOUNT>          prints `zone <KEY> <zone|null>`: what tedrisat holds now, for an `effects` check
//   restore <ACCOUNT>          PATCH /me with the kept value, deletes the file; `(nothing kept)` is not a failure
//
// ACCOUNT is a role key of graphs/.local/accounts.env or the name a binding gives it (basmuderris, koskNazim). The API is the shared
// helpers' own (lib.mjs): a real sign-in, no password on a command line, nothing secret printed. It changes one account's own setting and
// nobody else's; run it under the replay lock when you run it by hand. The kept file is named by the account alone: the two flows keep
// different accounts, and a walk of either that finds the other's leftover of the same account keeps the true first value.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { accountKey, Fail, LOCAL, must, run } from "./lib.mjs";

const MADE = resolve(LOCAL, "made");
const fileOf = (key) => resolve(MADE, `zone-${key}.json`);
const usage =
  "usage: zone.mjs keep|get|restore <ACCOUNT> | set <ACCOUNT> <zone|null>";

const zoneOf = async (account) =>
  (await must(account, "GET", "/me")).body.timeZone ?? null;
const put = (account, timeZone) => must(account, "PATCH", "/me", { timeZone });

run("zone", async () => {
  const [command, account, value, ...more] = process.argv.slice(2);
  if (!command || !account || more.length) throw new Fail(usage, 2);
  const key = accountKey(account);

  if (command === "keep") {
    if (value !== undefined) throw new Fail(usage, 2);
    if (existsSync(fileOf(key))) {
      console.log(`zone kept ${key} (already)`);
      return;
    }
    const timeZone = await zoneOf(account);
    mkdirSync(MADE, { recursive: true });
    writeFileSync(fileOf(key), JSON.stringify({ account: key, timeZone }));
    console.log(`zone kept ${key} ${timeZone}`);
  } else if (command === "set") {
    if (value === undefined) throw new Fail(usage, 2);
    await put(account, value === "null" ? null : value);
    console.log(`zone set ${key} ${value}`);
  } else if (command === "get") {
    if (value !== undefined) throw new Fail(usage, 2);
    console.log(`zone ${key} ${await zoneOf(account)}`);
  } else if (command === "restore") {
    if (value !== undefined) throw new Fail(usage, 2);
    if (!existsSync(fileOf(key))) {
      console.log(`zone restored ${key} (nothing kept)`);
      return;
    }
    const kept = JSON.parse(readFileSync(fileOf(key), "utf8"));
    await put(account, kept.timeZone ?? null);
    rmSync(fileOf(key));
    console.log(`zone restored ${key} ${kept.timeZone ?? null}`);
  } else {
    throw new Fail(usage, 2);
  }
});
