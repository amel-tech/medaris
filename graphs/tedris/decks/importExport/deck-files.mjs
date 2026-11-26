// What tedris.decks.importExport needs besides the seed: a deck of the walk's own with a known name, the files a person would choose for
// its import, and a few probes of tedris-web's three file routes as the deck's author (the flow's setup, teardown and effects). The deck is
// the spare `applicantG`'s own, private, "Kelime" type, and nothing seeded is touched: the seed's deck "Kelime Defterim" is other flows' data.
//
//   node ../tedris/decks/importExport/deck-files.mjs up [ACCOUNT] [--cards <n>]   the deck "Aktarma denemesi" (default account applicantG) with n
//                                                                              cards (default 0), the six files below, and graphs/.local/deck-files.json
//   node ../tedris/decks/importExport/deck-files.mjs down [ACCOUNT]               every deck of that name of the account is deleted, with its cards,
//                                                                              and the files and the json are removed
//   node ../tedris/decks/importExport/deck-files.mjs probe sample <xlsx|csv>      GET /api/decks/sample?format=...
//   node ../tedris/decks/importExport/deck-files.mjs probe export <xlsx|csv>      GET /api/decks/<deck>/export?format=...
//   node ../tedris/decks/importExport/deck-files.mjs probe import <case>          POST /api/decks/<deck>/import with one of the files, REFUSED cases only:
//                                                                              excelCsv, semicolon, empty, tooMany, bad, numeric (the clean file is
//                                                                              the walk's own, through the browser; a probe never adds a card)
//
// The files, in graphs/.local/deck-files/ (UTF-8, comma-separated, the header Card Type,Content Front,Content Back):
//   clean.csv      two VOCABULARY cards, "قَرَأَ" / "Okudu" and "كَتَبَ" / "Yazdı": the answer is 201 { count: 2 }
//   bad.csv        four rows, two of them bad: row 2 has a front and a back of one letter ("Satır 2: Ön yüz en az 3 karakter olmalı; Arka yüz en az 3
//                  karakter olmalı") and row 3 a front of two letters and no back ("Satır 3: Ön yüz en az 3 karakter olmalı; Arka yüz boş"); the
//                  answer is 422 and nothing is written: "2 satırda sorun var; hiçbir kart eklenmedi."
//   tooMany.csv    1001 valid rows: the answer is 422 BULK_ROW_LIMIT_EXCEEDED with the one error on row 1002 (IMPEXP-2)
//   empty.csv      the header and no row: the answer is 400 ("no data rows")
//   semicolon.csv  the same two cards as clean.csv with semicolons, as Excel in a Turkish locale saves a CSV: one column, no header matches, 400 (IMPEXP-3)
//   numeric.csv    one card whose front is 12345: it reaches the validator as a number and comes back as a row error told as "boş" (IMPEXP-4)
// `probe import excelCsv` sends clean.csv with the type application/vnd.ms-excel, which is how a browser on Windows with Excel names a .csv
// (IMPEXP-1): the answer is expected to be 500, from the code (excel.service.ts:257-264); this helper is how the walk phase finds out.
//
// What a probe prints (one line, substrings an `expect` can match; nothing secret):
//   probe sample csv 200 file=sample.csv type=text/csv header=Card Type,Content Front,Content Back cards=2 bom=none
//   probe sample xlsx 200 file=sample.xlsx zip=yes
//   probe export csv 200 file=Aktarma_denemesi.csv header=Card Type,Content Front,Content Back cards=<n> bom=none
//   probe import tooMany 422 rows=1002 fields=cards
//   probe import excelCsv 500 code=INTERNAL_ERROR
// A web session is made for every probe the way the browser makes it (the app's own /api/auth/signin, Keycloak's form, the callback: no
// password grant, no token minted), as helpers/lib.mjs does for the API and graphs/tedris/learning/addToCalendar/calendar-data.mjs does for a cookie.
//
// The only things written are the deck and its cards (through the API), the files and the json under graphs/.local. Run `up` and `down` under
// the replay lock when they are run by hand. Prints `deck-files <mode> <what was done>`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  env,
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const WEB = (process.env.TEDRIS_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const TITLE = "Aktarma denemesi";
const OWNER = "applicantG";
const DIR = resolve(LOCAL, "deck-files");
const JSON_FILE = resolve(LOCAL, "deck-files.json");
const timeout = () => AbortSignal.timeout(60_000);

const HEADER = "Card Type,Content Front,Content Back";
const csv = (rows) => `${[HEADER, ...rows].join("\n")}\n`;
const FIXTURES = {
  clean: csv(["VOCABULARY,قَرَأَ,Okudu", "VOCABULARY,كَتَبَ,Yazdı"]),
  bad: csv([
    "VOCABULARY,x,y",
    "VOCABULARY,ab,",
    "HADEETH,Üç harfli ön yüz,Üç harfli arka yüz",
    "VOCABULARY,Tamam ön yüz,Tamam arka yüz",
  ]),
  tooMany: csv(
    Array.from(
      { length: 1001 },
      (_, i) => `VOCABULARY,Kelime ${i + 1},Anlam ${i + 1}`
    )
  ),
  empty: `${HEADER}\n`,
  semicolon: "Card Type;Content Front;Content Back\nVOCABULARY;قَرَأَ;Okudu\n",
  numeric: csv(["VOCABULARY,12345,Beş basamaklı sayı"]),
};
// what a probe sends: one of the files above under the type a browser would give it. A browser on Windows with Excel installed
// names a .csv `application/vnd.ms-excel` (IMPEXP-1; general knowledge, not seen); everywhere else it is `text/csv`.
const PROBES = {
  excelCsv: { file: "clean", type: "application/vnd.ms-excel" },
  semicolon: { file: "semicolon", type: "text/csv" },
  empty: { file: "empty", type: "text/csv" },
  tooMany: { file: "tooMany", type: "text/csv" },
  bad: { file: "bad", type: "text/csv" },
  numeric: { file: "numeric", type: "text/csv" },
};

// ---- a web session, made over HTTP the way the browser makes it ----
const remember = (res, jar) => {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const name = pair.slice(0, pair.indexOf("="));
    const value = pair.slice(pair.indexOf("=") + 1);
    if (/;\s*Max-Age=0\b/i.test(c) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
};
const header = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function webSession(account) {
  const key = accountKey(account);
  const web = new Map();
  const kc = new Map();
  const start = await fetch(
    `${WEB}/api/auth/signin?callbackUrl=%2Fdecks&auto=1`,
    { redirect: "manual", signal: timeout() }
  );
  remember(start, web);
  const auth = start.headers.get("location");
  if (start.status !== 303 || !auth?.includes("/protocol/openid-connect/auth"))
    throw new Fail(
      `the web app's sign-in did not send the browser to Keycloak (status ${start.status})`
    );
  const page = await fetch(auth, { redirect: "manual", signal: timeout() });
  remember(page, kc);
  const html = await page.text();
  const action = /"loginAction"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  if (!action)
    throw new Fail(
      `Keycloak's page has no loginAction (status ${page.status})`
    );
  const post = await fetch(JSON.parse(`"${action}"`), {
    method: "POST",
    redirect: "manual",
    signal: timeout(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: header(kc),
    },
    body: new URLSearchParams({
      username: env()[`E2E_${key}_EMAIL`],
      password: env()[`E2E_${key}_PASSWORD`],
      credentialId: "",
    }),
  });
  const back = post.headers.get("location");
  if (
    post.status !== 302 ||
    !back?.startsWith(`${WEB}/api/auth/callback/keycloak`)
  )
    throw new Fail(
      `Keycloak did not hand back to the web app (status ${post.status})`
    );
  const callback = await fetch(back, {
    redirect: "manual",
    signal: timeout(),
    headers: { cookie: header(web) },
  });
  remember(callback, web);
  if (callback.status >= 400)
    throw new Fail(`the web app's callback answered ${callback.status}`);
  const me = await fetch(`${WEB}/api/auth/session`, {
    signal: timeout(),
    headers: { cookie: header(web) },
  });
  const who = await me.json().catch(() => null);
  if (!who?.user)
    throw new Fail("the web app holds no session after the callback");
  return header(web);
}

// ---- the deck and the files ----
async function idsOf(owner) {
  const out = await query(
    `select id from decks where title = '${TITLE}' and author_id = '${subOf(owner)}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
}

async function removeDecks(owner, ids) {
  for (const id of ids)
    await must(owner, "DELETE", `/flashcard/decks/${id}`, undefined, [404]);
}

function writeFiles() {
  mkdirSync(DIR, { recursive: true });
  const paths = {};
  for (const [name, text] of Object.entries(FIXTURES)) {
    const file = resolve(DIR, `${name}.csv`);
    writeFileSync(file, text, "utf8");
    paths[name] = file;
  }
  return paths;
}

const deckOf = () => {
  try {
    return JSON.parse(readFileSync(JSON_FILE, "utf8"));
  } catch {
    throw new Fail(`${JSON_FILE} is missing: run \`deck-files.mjs up\` first`);
  }
};

const bomOf = (bytes) =>
  bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "yes" : "none";
const nameOf = (disposition) =>
  /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "")?.[1] ??
  "none";

async function probeFile(kind, format) {
  if (!["xlsx", "csv"].includes(format))
    throw new Fail("usage: probe sample|export <xlsx|csv>", 2);
  const data = deckOf();
  const cookie = await webSession(data.owner);
  const path =
    kind === "sample"
      ? `/api/decks/sample?format=${format}`
      : `/api/decks/${data.deck}/export?format=${format}`;
  const res = await fetch(`${WEB}${path}`, {
    redirect: "manual",
    signal: timeout(),
    headers: { cookie },
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const file = nameOf(res.headers.get("content-disposition"));
  if (format === "xlsx") {
    const zip = bytes[0] === 0x50 && bytes[1] === 0x4b ? "yes" : "no";
    return `probe ${kind} ${format} ${res.status} file=${file} zip=${zip}`;
  }
  const text = new TextDecoder().decode(bytes);
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  return `probe ${kind} ${format} ${res.status} file=${file} type=${res.headers.get("content-type")} header=${lines[0] ?? ""} cards=${Math.max(lines.length - 1, 0)} bom=${bomOf(bytes)}`;
}

async function probeImport(name) {
  const probe = PROBES[name];
  if (!probe)
    throw new Fail(`usage: probe import <${Object.keys(PROBES).join("|")}>`, 2);
  const data = deckOf();
  const cookie = await webSession(data.owner);
  const form = new FormData();
  form.set(
    "file",
    new Blob([FIXTURES[probe.file]], { type: probe.type }),
    `${probe.file}.csv`
  );
  const res = await fetch(`${WEB}/api/decks/${data.deck}/import`, {
    method: "POST",
    body: form,
    redirect: "manual",
    signal: timeout(),
    headers: { cookie },
  });
  const body = await res.json().catch(() => null);
  let more = "";
  const errors = body?.context?.errors;
  if (Array.isArray(errors)) {
    more += ` rows=${errors.map((e) => e.row).join(",")}`;
    more += ` fields=${[...new Set(errors.flatMap((e) => (e.errors ?? []).map((f) => f.field)))].join(",")}`;
  }
  if (body?.code) more += ` code=${body.code}`;
  if (typeof body?.count === "number") more += ` count=${body.count}`;
  return `probe import ${name} ${res.status}${more}`;
}

run("deck-files", async () => {
  const args = process.argv.slice(2);
  const mode = args.shift();
  if (mode === "probe") {
    const [what, arg, ...extra] = args;
    if (extra.length)
      throw new Fail("usage: probe sample|export|import <arg>", 2);
    const line =
      what === "import"
        ? await probeImport(arg)
        : what === "sample" || what === "export"
          ? await probeFile(what, arg)
          : (() => {
              throw new Fail("usage: probe sample|export|import <arg>", 2);
            })();
    console.log(line);
    return;
  }
  if (!["up", "down"].includes(mode))
    throw new Fail("usage: deck-files.mjs up|down|probe ...", 2);
  const opts = options(args, { values: ["cards"] });
  if (opts.rest.length > 1)
    throw new Fail("usage: deck-files.mjs up|down [ACCOUNT] [--cards <n>]", 2);
  const owner = opts.rest[0] ?? OWNER;
  accountKey(owner);

  const old = await idsOf(owner);
  await removeDecks(owner, old);
  if (mode === "down") {
    rmSync(DIR, { recursive: true, force: true });
    rmSync(JSON_FILE, { force: true });
    console.log(`deck-files down ${old.length ? old.length : "none"}`);
    return;
  }

  const n = Number(opts.cards ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 1000)
    throw new Fail("--cards needs a whole number from 0 to 1000", 2);
  const made = await must(owner, "POST", "/flashcard/decks", {
    title: TITLE,
    cardType: "VOCABULARY",
  });
  const id = made.body.id;
  if (n > 0)
    await must(owner, "POST", `/flashcard/decks/${id}/cards/bulk`, [
      ...Array.from({ length: n }, (_, i) => ({
        type: "VOCABULARY",
        contentFront: `Kelime ${i + 1}`,
        contentBack: `Anlam ${i + 1}`,
      })),
    ]);
  const files = writeFiles();
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    JSON_FILE,
    `${JSON.stringify({ deck: id, title: TITLE, owner, cards: n, ...files }, null, 2)}\n`,
    { mode: 0o600 }
  );
  console.log(
    `deck-files up ${id} cards=${n}${old.length ? ` (removed ${old.length} old)` : ""}`
  );
});
