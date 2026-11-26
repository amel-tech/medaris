// What tedris.account.calendarFeed needs besides the page: the state of one account's personal calendar link, and the answers a
// calendar app gets at an address the walk knows. The walk's talebe is the spare `applicantG`; no course is made and nothing seeded is
// touched. The one table written is calendar_feed_tokens (tedrisat's, one row per user, only a SHA-256 of the secret), which no route
// deletes: SQL through the shared helper is the only way to take a link away, and `down` does it.
//
//   node ../tedris/account/calendarFeed/calendar-feed-data.mjs reset <ACCOUNT>   no link: the row, the snapshot and the known address are removed
//   node ../tedris/account/calendarFeed/calendar-feed-data.mjs arm <ACCOUNT>     a link made two days ago, with a secret this helper chose; its
//                                                                                address is kept in a curl config, so a poll can be made later
//   node ../tedris/account/calendarFeed/calendar-feed-data.mjs snap <ACCOUNT>    remembers the stored hash (the walk opens the dialog)
//   node ../tedris/account/calendarFeed/calendar-feed-data.mjs check <ACCOUNT>   after a link was made: one row, made within five minutes, a hash of 64
//                                                                                hex characters, and, when a hash was remembered, a different one
//   node ../tedris/account/calendarFeed/calendar-feed-data.mjs poll current      a calendar app reads the known address: 200, text/calendar, no-store,
//                                                                                noindex, an iCalendar body that names Medaris
//   node ../tedris/account/calendarFeed/calendar-feed-data.mjs poll old          the same address after a renewal: 404 CALENDAR_FEED_NOT_FOUND, no-store
//   node ../tedris/account/calendarFeed/calendar-feed-data.mjs down <ACCOUNT>    the link and the files are removed (the same as `reset`, its name in a teardown)
//
// Why a curl and not the page's own link. The link a person makes in the browser is shown once and exists only in the page; the replay
// cannot read it. A link this helper makes through SQL has a secret it knows, so a poll of "the kept link" and of "the replaced link"
// can be made and compared with what the page promises. The address is a secret, so it lives in a file, never on a command line:
//   graphs/.local/calendar-feed.known.curl   `url` of tedris-web's feed route, token included (mode 600, git-ignored)
//   graphs/.local/calendar-feed.json         the armed hash and the remembered one: hashes only, no token (mode 600, git-ignored)
// The poll limit is 20 a minute per owner; one poll makes one request.
// Run it under the replay lock when it is run by hand (it writes). Prints `calendar-feed <mode> <what was done>`. Nothing secret is printed.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import { Fail, LOCAL, run, subOf } from "../../../bindings/helpers/lib.mjs";

const WEB = (process.env.TEDRIS_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const KNOWN_CURL = resolve(LOCAL, "calendar-feed.known.curl");
const STATE = resolve(LOCAL, "calendar-feed.json");

const read = () =>
  existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const write = (data) => {
  writeFileSync(STATE, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(STATE, 0o600);
};
const secret = (file, text) => {
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
};
const rows = (out) =>
  out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

// the one row of an account: its stored hash, and whether it was made within five minutes
const rowOf = async (account) =>
  rows(
    await query(
      `select token_hash as h, (now() - created_at) < interval '5 minutes' as fresh from calendar_feed_tokens where user_id = '${subOf(account)}'`
    )
  )[0];

const wipe = async (account) => {
  const out = await query(
    `delete from calendar_feed_tokens where user_id = '${subOf(account)}' returning user_id`
  );
  for (const f of [STATE, KNOWN_CURL]) rmSync(f, { force: true });
  return out.trim() ? "the link was deleted" : "there was no link";
};

// `curl -sS -D - -K <file>`: the status line, the headers and the body on one string, as an effect would read them
const curl = (file) =>
  new Promise((done, fail) => {
    const p = spawn("curl", ["-sS", "-D", "-", "-K", file], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) =>
      code === 0 ? done(out) : fail(new Fail(`curl failed: ${err.trim()}`))
    );
  });

run("calendar-feed", async () => {
  const [mode, a] = process.argv.slice(2);
  if (mode === "reset" || mode === "down") {
    if (!a) throw new Fail(`usage: ${mode} <ACCOUNT>`, 2);
    console.log(
      `calendar-feed ${mode} ${await wipe(a)}; the snapshot and the known address are removed`
    );
  } else if (mode === "arm") {
    if (!a) throw new Fail("usage: arm <ACCOUNT>", 2);
    await wipe(a);
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    await query(
      `insert into calendar_feed_tokens (user_id, token_hash, created_at) values ('${subOf(a)}', '${hash}', now() - interval '2 days') on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = excluded.created_at returning user_id`
    );
    secret(KNOWN_CURL, `url = "${WEB}/calendar/${token}.ics"\n`);
    write({ armed: hash });
    console.log(
      "calendar-feed arm a link exists, made two days ago; its address is in the curl config"
    );
  } else if (mode === "snap") {
    if (!a) throw new Fail("usage: snap <ACCOUNT>", 2);
    const row = await rowOf(a);
    write({ ...read(), snap: row?.h ?? null });
    console.log(
      `calendar-feed snap ${row ? "the stored hash is remembered" : "there is no link to remember"}`
    );
  } else if (mode === "check") {
    if (!a) throw new Fail("usage: check <ACCOUNT>", 2);
    const row = await rowOf(a);
    if (!row) throw new Fail("the account holds no link row");
    if (!/^[0-9a-f]{64}$/.test(row.h))
      throw new Fail("the stored value is not a SHA-256 in hex");
    if (!row.fresh)
      throw new Fail("the link was not made within the last five minutes");
    const { snap } = read();
    if (snap && snap === row.h)
      throw new Fail(
        "the stored hash is the one remembered before the dialog: the link was not replaced"
      );
    console.log(`calendar-feed check ok: ${snap ? "replaced" : "new link"}`);
  } else if (mode === "poll") {
    if (!existsSync(KNOWN_CURL))
      throw new Fail("no known address: `arm` has not run for this scenario");
    const answer = await curl(KNOWN_CURL);
    const status = /^HTTP\/[\d.]+ (\d{3})/.exec(answer)?.[1];
    const head = answer.toLowerCase();
    if (a === "current") {
      if (status !== "200")
        throw new Fail(`the kept link answered ${status}, not 200`);
      const need = [
        "content-type: text/calendar",
        "cache-control: private, no-store",
        "x-robots-tag: noindex",
        "begin:vcalendar",
        "x-wr-calname:medaris",
      ];
      const lacking = need.filter((n) => !head.includes(n));
      if (lacking.length)
        throw new Fail(`the kept link's answer lacks ${lacking.join(", ")}`);
      console.log(
        "calendar-feed poll current: 200 text/calendar no-store noindex VCALENDAR Medaris"
      );
    } else if (a === "old") {
      if (status !== "404")
        throw new Fail(`the replaced link answered ${status}, not 404`);
      if (!answer.includes("CALENDAR_FEED_NOT_FOUND"))
        throw new Fail(
          "the replaced link's answer does not carry CALENDAR_FEED_NOT_FOUND"
        );
      if (!head.includes("cache-control: no-store"))
        throw new Fail("the replaced link's answer is not no-store");
      console.log(
        "calendar-feed poll old: 404 CALENDAR_FEED_NOT_FOUND no-store"
      );
    } else throw new Fail("usage: poll current|old", 2);
  } else {
    throw new Fail(
      "usage: calendar-feed-data.mjs reset|arm|snap|check|poll|down",
      2
    );
  }
});
