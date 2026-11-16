#!/usr/bin/env node
// A walk's own passive scopes, for the `setup`, `teardown` and `events` of nizam.inactive.viewContent (run with graphs/bindings/ as the
// working directory): a köşk, a course and a medrese that once had a manager and have none now, and one more köşk that a walk gives a
// manager again while the page is open. Nothing of the seed is touched: the scopes, the people who "managed" them and the host köşk
// of the course are made here, under ids derived from the tag, so that a second `make` or a `remove` finds them again whatever a
// crashed walk left.
//
//   node helpers/passive-scopes.mjs make   <tag>        remove what the tag made, make it again, check the list sees it
//   node helpers/passive-scopes.mjs remove <tag>        delete everything the tag made, and every audit row about it
//   node helpers/passive-scopes.mjs attend <tag> gone   the başnazım gives the "gone" köşk a nazım (POST .../assign)
//   node helpers/passive-scopes.mjs view   <tag> <kosk|course|gone>   one opening, as the page makes it (POST .../view)
//
// What `make` writes, and why by SQL. tedrisat has no route that leaves a course without its last müderris (a course never loses it
// by removal, course.service.ts:1061, owner decision d-1004-13; only a term that runs out does), and a köşk or a medrese goes passive
// through the API only after a real account has held the post (open it with a nazım, then POST .../deactivate), which would put one
// of the stack's accounts in a role it must not keep. So the rows go in as apps/nizam/e2e/inactive-seed.ts puts them (fake people in
// `users`, `role_assignments` rows that ran out on a past date, the scopes), with the same columns; the NOT NULL columns without a
// default were read from the database's own catalogue. Every manager is a fake person made here; no account of accounts.env takes
// part, and the başnazım's own sub stands only as owner and granter. One SQL transaction, run by helpers/db.mjs through the stack's
// Postgres container, as helpers/sql.mjs does.
//
//   köşk      "Pasif köşk <tag>"        KOSK_NAZIM expired on 30 Eylül 2026       (the köşk row's "İçeriği gör" opens /kosks/<id>)
//   course    "Pasif ders <tag>"        MUDERRIS (the imam) expired the same day, in the host köşk "Ev sahibi köşk <tag>", which has a
//                                       nazım of its own (an attended köşk is not listed)
//   medrese   "Pasif medrese <tag>"     MEDRESE_BASMUDERRIS expired on 27 Eylül 2026 (its row has no "İçeriği gör")
//   gone      "Devredilen köşk <tag>"   like the köşk; `attend` seats `goneNazim`, a fake person, through the app's own assign route
//
// What `remove` takes away: every audit row whose entity or details name one of the ids (the openings a walk wrote, the assignment of
// `attend`, any content read the destination pages wrote), the role rows, the course, the medrese, the köşks and the fake people.
// tedrisat has no route that deletes an audit row; this is the one SQL delete, and it only ever names these ids. A second `remove`
// finds nothing and says so. The binding's `data` reads the ids from graphs/.local/made/<tag>.json (git-ignored), which `make` writes
// and `remove` deletes.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { query } from "./db.mjs";
import { Fail, LOCAL, must, run, subOf } from "./lib.mjs";

const MADE = resolve(LOCAL, "made");
const file = (tag) => resolve(MADE, `${tag}.json`);

/** A version 5 style uuid from the tag and a part's name: the same every time, so a second run finds what the first made. */
function uuid(tag, part) {
  const h = createHash("sha1")
    .update(`medaris-graphs:${tag}:${part}`)
    .digest("hex");
  const variant = ((Number.parseInt(h[16], 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

export function plan(tag) {
  if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(tag ?? ""))
    throw new Fail(
      "usage: <command> <tag> (letters and digits, from a letter)",
      2
    );
  const id = (part) => uuid(tag, part);
  return {
    tag,
    kosk: id("kosk"),
    koskName: `Pasif köşk ${tag}`,
    gone: id("gone"),
    goneName: `Devredilen köşk ${tag}`,
    host: id("host"),
    hostName: `Ev sahibi köşk ${tag}`,
    course: id("course"),
    courseTitle: `Pasif ders ${tag}`,
    madrasah: id("madrasah"),
    madrasahName: `Pasif medrese ${tag}`,
    madrasahHandle: `${tag.toLowerCase()}-medrese`,
    goneNazim: id("user-goneNew"),
    // fake people, who held the posts: id, given name, family name
    people: [
      [id("user-koskLast"), "Eski", "Köşk Nazımı"],
      [id("user-goneLast"), "Önceki", "Köşk Nazımı"],
      [id("user-goneNew"), "Yeni", "Köşk Nazımı"],
      [id("user-hostNazim"), "Aktif", "Köşk Nazımı"],
      [id("user-courseLast"), "Eski", "Hoca"],
      [id("user-head"), "Eski", "Başmüderris"],
    ],
  };
}

function scopeIds(p) {
  return [p.kosk, p.gone, p.host, p.course, p.madrasah];
}

/** The statements that take away everything a tag made: audit rows first, then what they pointed at. */
export function removeStatements(p) {
  const ids = scopeIds(p);
  const people = p.people.map((x) => x[0]);
  const inList = (xs) => xs.map(lit).join(", ");
  return [
    `delete from audit_log where entity_id in (${inList(ids)}) or details::text ~ ${lit(ids.join("|"))}`,
    `delete from role_assignments where scope_id in (${inList(ids)}) or user_id in (${inList(people)})`,
    `delete from course_muderris where course_id = ${lit(p.course)}`,
    `delete from courses where id = ${lit(p.course)}`,
    `delete from madrasahs where id = ${lit(p.madrasah)}`,
    `delete from kosks where id in (${inList([p.kosk, p.gone, p.host])})`,
    `delete from users where id in (${inList(people)})`,
  ];
}

async function removeAll(p) {
  const out = await query(removeStatements(p).join(";\n"));
  rmSync(file(p.tag), { force: true });
  return out
    .split("\n")
    .filter(Boolean)
    .reduce((n, line) => n + (JSON.parse(line).rows ?? 0), 0);
}

/** The statements that make a tag's scopes, with the başnazım's sub as owner and granter. */
export function makeStatements(p, chief) {
  const email = (id) => `${id.slice(0, 8)}.${p.tag.toLowerCase()}@example.test`;
  const past = {
    start: "2026-06-01T09:00:00Z",
    koskEnd: "2026-09-30T09:00:00Z",
    headEnd: "2026-09-27T09:00:00Z",
  };
  const [koskLast, goneLast, , hostNazim, courseLast, head] = p.people.map(
    (x) => x[0]
  );
  return [
    `insert into users(id, given_name, family_name, email) values
      ${p.people.map(([id, g, f]) => `(${lit(id)}, ${lit(g)}, ${lit(f)}, ${lit(email(id))})`).join(",\n      ")}`,
    `insert into madrasahs(id, handle, name, created_by) values
      (${lit(p.madrasah)}, ${lit(p.madrasahHandle)}, ${lit(p.madrasahName)}, ${lit(chief)})`,
    `insert into kosks(id, owner_id, name) values
      (${lit(p.kosk)}, ${lit(chief)}, ${lit(p.koskName)}),
      (${lit(p.gone)}, ${lit(chief)}, ${lit(p.goneName)}),
      (${lit(p.host)}, ${lit(chief)}, ${lit(p.hostName)})`,
    `insert into courses(id, kosk_id, author_id, title, status) values
      (${lit(p.course)}, ${lit(p.host)}, ${lit(chief)}, ${lit(p.courseTitle)}, 'PUBLISHED')`,
    `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam, created_at, expires_at) values
      (${lit(koskLast)}, 'KOSK_NAZIM', 'kosk', ${lit(p.kosk)}, ${lit(chief)}, false, ${lit(past.start)}, ${lit(past.koskEnd)}),
      (${lit(goneLast)}, 'KOSK_NAZIM', 'kosk', ${lit(p.gone)}, ${lit(chief)}, false, ${lit(past.start)}, ${lit(past.koskEnd)}),
      (${lit(hostNazim)}, 'KOSK_NAZIM', 'kosk', ${lit(p.host)}, ${lit(chief)}, false, ${lit(past.start)}, null),
      (${lit(courseLast)}, 'MUDERRIS', 'course', ${lit(p.course)}, ${lit(chief)}, true, ${lit(past.start)}, ${lit(past.koskEnd)}),
      (${lit(head)}, 'MEDRESE_BASMUDERRIS', 'madrasah', ${lit(p.madrasah)}, ${lit(chief)}, false, ${lit(past.start)}, ${lit(past.headEnd)})`,
  ];
}

async function make(p) {
  const chief = subOf("systemAdmin");
  await removeAll(p);
  try {
    await query(makeStatements(p, chief).join(";\n"));
    mkdirSync(MADE, { recursive: true });
    writeFileSync(
      file(p.tag),
      `${JSON.stringify({
        tag: p.tag,
        kosk: p.kosk,
        koskName: p.koskName,
        gone: p.gone,
        goneName: p.goneName,
        goneNazim: p.goneNazim,
        host: p.host,
        hostName: p.hostName,
        course: p.course,
        courseTitle: p.courseTitle,
        madrasah: p.madrasah,
        madrasahName: p.madrasahName,
      })}\n`
    );
    // the list the page reads must hold the four scopes, or the walk would fail on a screen that never had them
    const listed = (await must("SYSTEM_ADMIN", "GET", "/nizam/inactive-scopes"))
      .body;
    const missing = [
      ["KOSK", p.kosk],
      ["KOSK", p.gone],
      ["COURSE", p.course],
      ["MADRASAH", p.madrasah],
    ].filter(
      ([type, id]) => !listed.some((r) => r.type === type && r.id === id)
    );
    if (missing.length)
      throw new Fail(
        `the list of passive scopes does not hold ${missing.map(([t]) => t).join(", ")} after make`
      );
  } catch (e) {
    await removeAll(p).catch(() => undefined);
    throw e;
  }
}

const read = (tag) => {
  try {
    return JSON.parse(readFileSync(file(tag), "utf8"));
  } catch {
    throw new Fail(`${file(tag)} does not exist: run make ${tag} first`);
  }
};

async function main() {
  const [command, tag, key, ...more] = process.argv.slice(2);
  if (more.length) throw new Fail("too many arguments", 2);
  const p = plan(tag);
  if (command === "make") {
    await make(p);
    console.log(`passive-scopes make ${tag} ready`);
  } else if (command === "remove") {
    const n = await removeAll(p);
    console.log(`passive-scopes remove ${tag} removed ${n} rows`);
  } else if (command === "attend") {
    if (key !== "gone") throw new Fail("attend takes the köşk `gone`", 2);
    const made = read(tag);
    await must(
      "SYSTEM_ADMIN",
      "POST",
      `/nizam/inactive-scopes/KOSK/${made.gone}/assign`,
      { userId: made.goneNazim }
    );
    console.log(`passive-scopes attend ${tag} gone`);
  } else if (command === "view") {
    const types = {
      kosk: ["KOSK", "kosk"],
      gone: ["KOSK", "gone"],
      course: ["COURSE", "course"],
    };
    if (!types[key]) throw new Fail("view takes kosk, course or gone", 2);
    const made = read(tag);
    await must(
      "SYSTEM_ADMIN",
      "POST",
      `/nizam/inactive-scopes/${types[key][0]}/${made[types[key][1]]}/view`
    );
    console.log(`passive-scopes view ${tag} ${key}`);
  } else {
    throw new Fail(
      "usage: passive-scopes.mjs make|remove|attend|view <tag> [key]",
      2
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run("passive-scopes", main);
