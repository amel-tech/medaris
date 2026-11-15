#!/usr/bin/env node
// The walk data of nazar.courses.browse, made and removed through tedrisat's HTTP API. A `run` of the scenarios' `setup` and `teardown`
// in binding.yaml; its working directory is graphs/bindings/, which is why the import below goes up three folders from this one.
//
//   node ../nazar/courses/browse/fixtures.mjs up mixed    the medrese of the seed with a second hosting köşk and four courses (below)
//   node ../nazar/courses/browse/fixtures.mjs up fresh    a medrese of its own, with no course and no hosting right, whose başmüderris is the spare talebe APPLICANT_F
//   node ../nazar/courses/browse/fixtures.mjs up hosted   the same medrese with one köşk that holds a hosting right of it and has no course there
//   node ../nazar/courses/browse/fixtures.mjs down        take away whatever either made (also first thing in `up`, so a walk that died leaves nothing)
//
// `up mixed` makes, as the başnazım (SYSTEM_ADMIN), what courses#1-#3 of apps/nazar/e2e/courses.e2e.ts build with SQL:
//   - the köşk "Dersler Deneme Köşkü" (short name dersler-deneme), its first nazım the spare talebe APPLICANT_B, and a hosting right of the
//     seeded medrese in it: POST /kosks, POST /kosks/:id/hosting-rights. The seeded medrese then has two hosting köşks (the seed's
//     Süleymaniye Köşkü and this one) and the köşk filter offers three options;
//   - "Deneme dersi cbrowse-a": published in Süleymaniye Köşkü, asks for approval, two applications waiting (APPLICANT_C, APPLICANT_D: two
//     talebe of their own, who hold nothing else), and DERS_NAZIR as a second hoca, so the imam's star is drawn;
//   - "Deneme dersi cbrowse-d": a draft in Süleymaniye Köşkü with nobody in it;
//   - "Deneme dersi cbrowse-b": published in the new köşk with nobody in it, and one exam celse planned in it (POST
//     /courses/:id/sessions/batch with `exam: {}`), so the exam card has a row ("1 sınav · 0 giren · 0 girmeyen" and "Ortalama yok").
//   The courses are made by helpers/course.mjs (which keeps each under graphs/.local/made/<tag>.json); the köşk's and the medrese's
//   ids are kept in graphs/.local/made/cbrowse-fixture.json, which the binding reads as the data source `made`.
// `up fresh` makes the medrese "Dersler Deneme Medresesi" (POST /madrasahs) with APPLICANT_F as its başmüderris: a medrese with no
//   course and no köşk that hosts it, which the seed has not got. `up hosted` also makes the köşk above and its hosting right of this
//   medrese, so that a medrese with no course can open one.
//
// `down` removes the three courses (course.mjs remove: the talebe leave, the course goes with its celses and the mails it sent), the
// köşk (DELETE /kosks/:id takes its hosting right with it), the medrese (DELETE /madrasahs/:id), and clears the notifications the
// appointments sent to APPLICANT_B and APPLICANT_F, who start with none (helpers/README.md). Seeded rows are never read or changed.
//
// Prints one line: `ready: mixed ...`, `ready: fresh ...`, `ready: hosted ...` or `removed ...`. Nothing secret is printed: the helpers' token cache and
// accounts file are read inside lib.mjs (graphs/bindings/helpers). Run it under the replay lock when you run it by hand.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Fail,
  LOCAL,
  must,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HELPERS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bindings/helpers"
);
const FILE = resolve(LOCAL, "made", "cbrowse-fixture.json");
const TAGS = ["cbrowse-a", "cbrowse-b", "cbrowse-d"];
const KOSK = { name: "Dersler Deneme Köşkü", handle: "dersler-deneme" };
const MADRASAH = {
  name: "Dersler Deneme Medresesi",
  handle: "dersler-deneme-medrese",
};
const NAZIM = "APPLICANT_B"; // the new köşk's first nazım
const HEAD = "APPLICANT_F"; // the başmüderris of the new medrese
const WAITING = ["APPLICANT_C", "APPLICANT_D"]; // the two applications that wait on cbrowse-a

// another helper of graphs/bindings/helpers, run as a command; its failure is one line
function helper(file, ...args) {
  try {
    return execFileSync(process.execPath, [resolve(HELPERS, file), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    throw new Fail(
      `${file} ${args.join(" ")}: ${String(e.stderr || e.message).trim()}`
    );
  }
}

const readKept = () =>
  existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
function keep(patch) {
  mkdirSync(dirname(FILE), { recursive: true, mode: 0o700 });
  writeFileSync(FILE, `${JSON.stringify({ ...readKept(), ...patch })}\n`, {
    mode: 0o600,
  });
}

// the köşks with this short name (the directory lists a handle with or without its @)
async function koskIds() {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(KOSK.handle)}&limit=50`
    )
  ).body;
  return (found.items ?? [])
    .filter(
      (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === KOSK.handle
    )
    .map((k) => k.id);
}

// the medreses of this name: the id kept by `up fresh`, and any other found by its name
async function madrasahIds() {
  const kept = readKept().madrasah;
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/madrasahs/explore?q=${encodeURIComponent(MADRASAH.name)}`
    )
  ).body;
  const ids = new Set(
    (Array.isArray(found) ? found : [])
      .filter((m) => m.name === MADRASAH.name)
      .map((m) => m.id)
  );
  if (kept) ids.add(kept);
  return [...ids];
}

async function down() {
  for (const tag of TAGS) helper("course.mjs", "remove", tag);
  const kosks = await koskIds();
  for (const id of kosks) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${id}`);
  const madrasahs = await madrasahIds();
  for (const id of madrasahs)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  for (const who of [NAZIM, HEAD]) helper("notify.mjs", who, "clear");
  rmSync(FILE, { force: true });
  return `removed ${kosks.length} köşk, ${madrasahs.length} medrese, ${TAGS.length} courses`;
}

// an ISO weekday (1 = Monday) and a date, `days` from now
function inDays(days) {
  const day = new Date(Date.now() + days * 86_400_000);
  return {
    date: day.toISOString().slice(0, 10),
    weekday: ((day.getUTCDay() + 6) % 7) + 1,
  };
}

const makeCourse = (tag, ...args) =>
  JSON.parse(helper("course.mjs", "make", tag, ...args));

// the köşk "Dersler Deneme Köşkü" and a hosting right of the medrese in it
async function makeKosk(madrasah) {
  const made = await must("SYSTEM_ADMIN", "POST", "/kosks", {
    name: KOSK.name,
    handle: KOSK.handle,
    description: "Dersler sayfasının denemesi için açıldı.",
    managerUserIds: [subOf(NAZIM)],
  });
  const kosk = made.body.id;
  keep({ kosk, koskName: KOSK.name });
  await must("SYSTEM_ADMIN", "POST", `/kosks/${kosk}/hosting-rights`, {
    madrasahId: madrasah,
  });
  return kosk;
}

async function upMixed() {
  const madrasah = seed().madrasah;
  const kosk = await makeKosk(madrasah);
  const a = makeCourse(
    "cbrowse-a",
    "--madrasah",
    madrasah,
    "--approval",
    "--weeks",
    "1",
    "--lessons",
    "1",
    "--talebe",
    ...WAITING
  );
  helper("seat-hoca.mjs", a.course, "DERS_NAZIR");
  makeCourse(
    "cbrowse-d",
    "--madrasah",
    madrasah,
    "--draft",
    "--weeks",
    "1",
    "--lessons",
    "1"
  );
  const b = makeCourse(
    "cbrowse-b",
    "--madrasah",
    madrasah,
    "--kosk",
    kosk,
    "--weeks",
    "1",
    "--lessons",
    "1"
  );
  const exam = inDays(6);
  await must("SYSTEM_ADMIN", "POST", `/courses/${b.course}/sessions/batch`, {
    weekdays: [exam.weekday],
    startTime: "21:00",
    startDate: exam.date,
    count: 1,
    title: "Ara sınav",
    durationMinutes: 60,
    exam: {},
  });
  return `ready: mixed, köşk ${kosk}, 3 courses`;
}

async function upFresh(hosted) {
  const made = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name: MADRASAH.name,
    handle: MADRASAH.handle,
    headMuderrisUserId: subOf(HEAD),
  });
  keep({ madrasah: made.body.id, madrasahName: MADRASAH.name });
  if (hosted) await makeKosk(made.body.id);
  return `ready: ${hosted ? "hosted" : "fresh"}, medrese ${made.body.id}`;
}

run("fixtures", async () => {
  const [verb, which, ...more] = process.argv.slice(2);
  const ok =
    (verb === "up" && ["mixed", "fresh", "hosted"].includes(which ?? "")) ||
    (verb === "down" && which === undefined);
  if (!ok || more.length)
    throw new Fail("usage: fixtures.mjs up mixed|fresh|hosted | down", 2);
  const removed = await down(); // `up` starts from nothing: a walk that died leaves nothing behind for the next one
  if (verb === "down") {
    console.log(removed);
    return;
  }
  console.log(
    which === "mixed" ? await upMixed() : await upFresh(which === "hosted")
  );
});
