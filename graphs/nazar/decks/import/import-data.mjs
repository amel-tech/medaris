// What nazar.decks.import needs on top of `helpers/course.mjs make import` (the course itself is made and removed there): two decks of the walk's
// own in that course, the files a person would choose for the import, and a probe of nazar-web's template route. Used by the flow's setup,
// teardown and effects.
//
//   node ../nazar/decks/import/import-data.mjs up <decks|none>   removes what an earlier walk left, then (decks) opens two draft decks of the made
//                                                               course as MUDERRIS, "Aktarma denemesi A" and "Aktarma denemesi B" (Kelime, no
//                                                               week, no card), (none) opens none; writes the files below and
//                                                               graphs/.local/deck-import.json (ids and paths, no secret)
//   node ../nazar/decks/import/import-data.mjs down              deletes every deck of those titles that MUDERRIS wrote (their cards go with them),
//                                                               and the files and the json; run it BEFORE `course.mjs remove import`, because
//                                                               deleting a course only sets its decks' course to null and leaves them behind
//   node ../nazar/decks/import/import-data.mjs probe sample <xlsx|csv|other>
//                                                               GET /api/decks/sample?format=... at nazar-web, with a web session of MUDERRIS
//
// The decks are drafts on purpose: a course deck is deleted through DELETE /courses/:id/decks/:deckId only while it is a draft, and `down` needs
// no more than the decks' titles. The course is `course.mjs make import --weeks 1 --lessons 1 --hoca MUDERRIS` (the seed's second köşk, which no
// seeded flow reads); its id is in graphs/.local/made/import.json.
//
// The files, in graphs/.local/deck-import/ (UTF-8, comma-separated, the header Card Type,Content Front,Content Back):
//   template.xlsx  the template as tedrisat serves it (GET /flashcard/cards/bulk/sample?format=xlsx), unedited: a HADEETH row and a VOCABULARY row,
//                  so the answer is 201 { count: 2 } and one of the two cards is a HADEETH in a Kelime deck (IMPORT-4)
//   clean.csv      two VOCABULARY cards, "قَرَأَ" / "Okudu" and "كَتَبَ" / "Yazdı": 201 { count: 2 }
//   bad.csv        four lines, two of them bad: row 2 has a front and a back of one letter, row 3 a front of two letters; the answer is 422 with
//                  rows 2 and 3 and nothing is written: "2 satırda hata var. ..."
//   tooMany.csv    1001 valid rows: 422 BULK_ROW_LIMIT_EXCEEDED with the one error on row 1002 (IMPORT-2)
//   empty.csv      the header and no row: 400 ("no data rows"), told as the generic failure (IMPORT-3)
//   notSheet.txt   the clean file under a name that is not .xlsx or .csv: the dialog refuses it by its name and sends nothing
//   midSize.csv    about 1.4 MB of valid rows: over Next's default body limit for a Server Action (1 MB) and under the dialog's own 5 MB (F-D1-18);
//                  if the limit is ever raised the answer is the 422 of tooMany, since it holds far more than 1000 rows
//   tooBig.csv     about 5.9 MB: the dialog refuses it by its size and sends nothing
//
// What `probe sample` prints (one line, substrings an `expect` can match; nothing secret):
//   probe sample csv 200 file=deste-ornek.csv type=text/csv; charset=utf-8 header=Card Type,Content Front,Content Back cards=2 bom=none
//   probe sample xlsx 200 file=deste-ornek.xlsx type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet zip=yes
//   probe sample other 200 file=deste-ornek.xlsx type=... zip=yes      (format=pdf: nazar gives the workbook; tedris would answer 400)
// A web session is made for every probe the way the browser makes it (the app's own /api/auth/signin, Keycloak's form, the callback: no
// password grant, no token minted), as graphs/tedris/decks/importExport/deck-files.mjs does for tedris-web.
//
// The only things written are the decks and their cards (through the API), the files and the json under graphs/.local. Run `up` and `down` under
// the replay lock when they are run by hand. Prints `import-data <mode> <what was done>`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  API,
  accountKey,
  env,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
  token,
} from "../../../bindings/helpers/lib.mjs";

const WEB = (process.env.NAZAR_URL ?? "http://localhost:4002").replace(
  /\/$/,
  ""
);
const OWNER = "muderris";
const TAG = "import";
const TITLES = ["Aktarma denemesi A", "Aktarma denemesi B"];
const DIR = resolve(LOCAL, "deck-import");
const JSON_FILE = resolve(LOCAL, "deck-import.json");
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const timeout = () => AbortSignal.timeout(60_000);

const HEADER = "Card Type,Content Front,Content Back";
const csv = (rows) => `${[HEADER, ...rows].join("\n")}\n`;
const rowsOf = (n) =>
  Array.from(
    { length: n },
    (_, i) => `VOCABULARY,Kelime ${i + 1},Anlam ${i + 1}`
  );
const CLEAN = csv(["VOCABULARY,قَرَأَ,Okudu", "VOCABULARY,كَتَبَ,Yazdı"]);
const FIXTURES = {
  "clean.csv": CLEAN,
  "bad.csv": csv([
    "VOCABULARY,x,y",
    "VOCABULARY,ab,yedi",
    "VOCABULARY,Tamam ön yüz,Tamam arka yüz",
  ]),
  "tooMany.csv": csv(rowsOf(1001)),
  "empty.csv": `${HEADER}\n`,
  "notSheet.txt": CLEAN,
  "midSize.csv": csv(rowsOf(40_000)),
  "tooBig.csv": csv(rowsOf(160_000)),
};
// what the dialog and Next see: the two sizes must fall where the scenarios say
const SIZES = {
  "midSize.csv": [1_100_000, 5_000_000],
  "tooBig.csv": [5_300_000, Infinity],
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
  const start = await fetch(`${WEB}/api/auth/signin?callbackUrl=%2F`, {
    redirect: "manual",
    signal: timeout(),
  });
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

// ---- the decks and the files ----
async function leftBehind() {
  const titles = TITLES.map((t) => `'${t}'`).join(", ");
  const out = await query(
    `select id from decks where title in (${titles}) and author_id = '${subOf(OWNER)}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
}

async function clean() {
  const ids = await leftBehind();
  for (const id of ids)
    await must(OWNER, "DELETE", `/flashcard/decks/${id}`, undefined, [404]);
  return ids.length;
}

async function templateBytes() {
  const res = await fetch(`${API}/flashcard/cards/bulk/sample?format=xlsx`, {
    signal: timeout(),
    headers: { authorization: `Bearer ${await token(OWNER)}` },
  });
  if (!res.ok)
    throw new Fail(`GET /flashcard/cards/bulk/sample answered ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Fail("the template tedrisat served is not a workbook");
  return bytes;
}

async function writeFiles() {
  mkdirSync(DIR, { recursive: true });
  const paths = {};
  for (const [name, text] of Object.entries(FIXTURES)) {
    const file = resolve(DIR, name);
    writeFileSync(file, text, "utf8");
    const [min, max] = SIZES[name] ?? [0, Infinity];
    const size = Buffer.byteLength(text);
    if (size < min || size > max)
      throw new Fail(`${name} is ${size} bytes, not between ${min} and ${max}`);
    paths[name.replace(/\.[a-z]+$/, "")] = file;
  }
  const template = resolve(DIR, "template.xlsx");
  writeFileSync(template, await templateBytes());
  paths.template = template;
  return paths;
}

const madeCourse = () => {
  try {
    const { course } = JSON.parse(readFileSync(MADE, "utf8"));
    if (course) return course;
  } catch {
    // reported below
  }
  throw new Fail(`${MADE} is missing: run \`course.mjs make ${TAG}\` first`);
};

async function up(mode) {
  if (!["decks", "none"].includes(mode))
    throw new Fail("usage: import-data.mjs up <decks|none>", 2);
  const removed = await clean();
  const course = madeCourse();
  const ids = [];
  if (mode === "decks")
    for (const title of TITLES) {
      const r = await must(OWNER, "POST", `/courses/${course}/decks`, {
        title,
        cardType: "VOCABULARY",
        draft: true,
      });
      ids.push(r.body.id);
    }
  const files = await writeFiles();
  writeFileSync(
    JSON_FILE,
    `${JSON.stringify({ course, deckA: ids[0] ?? null, deckB: ids[1] ?? null, ...files }, null, 2)}\n`,
    { mode: 0o600 }
  );
  return `up ${mode} decks=${ids.length} removed=${removed} files=${Object.keys(files).length}`;
}

async function down() {
  const removed = await clean();
  rmSync(DIR, { recursive: true, force: true });
  rmSync(JSON_FILE, { force: true });
  return `down removed=${removed}`;
}

const bomOf = (bytes) =>
  bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "yes" : "none";
const nameOf = (disposition) =>
  /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "")?.[1] ??
  "none";

async function probeSample(format) {
  const asked = { xlsx: "xlsx", csv: "csv", other: "pdf" }[format];
  if (!asked) throw new Fail("usage: probe sample <xlsx|csv|other>", 2);
  const cookie = await webSession(OWNER);
  const res = await fetch(`${WEB}/api/decks/sample?format=${asked}`, {
    redirect: "manual",
    signal: timeout(),
    headers: { cookie },
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const file = nameOf(res.headers.get("content-disposition"));
  const type = res.headers.get("content-type");
  if (format !== "csv") {
    const zip = bytes[0] === 0x50 && bytes[1] === 0x4b ? "yes" : "no";
    return `probe sample ${format} ${res.status} file=${file} type=${type} zip=${zip}`;
  }
  const text = new TextDecoder().decode(bytes);
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  return `probe sample ${format} ${res.status} file=${file} type=${type} header=${lines[0] ?? ""} cards=${Math.max(lines.length - 1, 0)} bom=${bomOf(bytes)}`;
}

run("import-data", async () => {
  const [mode, ...rest] = process.argv.slice(2);
  let line;
  if (mode === "up") line = await up(rest[0]);
  else if (mode === "down") line = await down();
  else if (mode === "probe" && rest[0] === "sample")
    line = await probeSample(rest[1]);
  else
    throw new Fail(
      "usage: import-data.mjs up <decks|none> | down | probe sample <xlsx|csv|other>",
      2
    );
  console.log(mode === "probe" ? line : `import-data ${line}`);
});
