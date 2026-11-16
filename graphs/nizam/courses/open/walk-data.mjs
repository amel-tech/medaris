#!/usr/bin/env node
// The data of nizam.courses.open's walks: a köşk of the walk's own, made through tedrisat's HTTP API, and every course the walk opens in it,
// found by its title and taken away again by the tag. The seeded köşks are other flows' data (their courses, their policy), and this flow
// opens courses, so it never opens one there. Run from graphs/bindings/ (the replay's working directory):
//
//   node ../nizam/courses/open/walk-data.mjs make <tag> [--locked] [--request]
//   node ../nizam/courses/open/walk-data.mjs revoke <tag>
//   node ../nizam/courses/open/walk-data.mjs answer <tag>
//   node ../nizam/courses/open/walk-data.mjs remove <tag>
//
// make    Opens the köşk "Deneme <tag> Köşkü" (short name deneme-<tag>) as the başnazım, with KOSK_NAZIM as its one nazım, and:
//           --locked   the köşk's policy alwaysRequireApproval is on from the start (the form then fixes "Kayıt onayı gereksin" on);
//           --request  a course request of the seeded medrese to this köşk, titled "Deneme dersi <tag> talep", sent by the başnazım (who may
//                      send one for any medrese): the page ?talep=<its id> of the form opens with that title.
//         Prints one JSON line {"tag","kosk","koskName","handle","title","request"} and writes it to graphs/.local/made/<tag>.json, which a
//         binding reads as a data source (`made: { json: ../.local/made/<tag>.json }`, then `{made.kosk}`, `{made.request}`). Making a tag
//         again removes the old one first; the file is written the moment the köşk exists, so a crash half way is still removable.
// revoke  KOSK_NAZIM is taken off the köşk's nazımlar (the başnazım takes their place: the last nazım needs a successor), so a form that
//         is open in KOSK_NAZIM's browser is refused when it is sent: the walk of "the right is gone" runs it between filling the form and
//         pressing "Dersi aç". A nazım already taken off is fine.
// answer  The request is answered by someone else (the başnazım rejects it) while the form is open: the walk of "the request is gone by the
//         time the course exists" runs it just before "Dersi aç". A request already answered is fine.
// remove  Finds every course whose title starts with "Deneme dersi <tag>" (in any köşk, so a crashed walk's leftovers go too), takes away
//         its decks (decks.course_id is `on delete set null`, so a deleted course would leave them as private decks), deletes the course as the
//         başnazım, then the notifications that point at the course or its celses (no route deletes one: the one SQL write, with the request
//         rows of the title), then the köşk (by its id, and by its short name in the directory), then the file. Safe to run twice: a tag with
//         nothing to remove is `none`.
//
// What a walk leaves behind and this cannot remove: audit_log rows (kosk.create, kosk.delete, course_request.create and .accept or .reject,
// user.lookup for each hoca found, permission rows of the nazım change). Nothing is sent to anyone: the course has no enrolled talebe.
// Run it under the replay lock when walks are running and you run it by hand.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: walk-data.mjs make <tag> [--locked] [--request] | revoke <tag> | answer <tag> | remove <tag>";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const titleOf = (tag) => `Deneme dersi ${tag}`;

function keep(made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(made.tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

const recorded = (tag) => {
  if (!existsSync(fileOf(tag))) throw new Fail(`no köşk recorded for ${tag}`);
  return JSON.parse(readFileSync(fileOf(tag), "utf8"));
};

const rowsOf = (stdout) =>
  stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));

async function remove(tag) {
  const file = fileOf(tag);
  const made = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const title = titleOf(tag);
  // by the title, wherever the course is: a tag is lower-case letters, digits and -, so nothing here needs quoting
  const courses = rowsOf(
    await query(`select id from courses where title like '${title}%'`)
  ).map((r) => r.id);
  const targets = [];
  for (const id of courses) {
    targets.push(id);
    const lessons = rowsOf(
      await query(
        `select l.id from lessons l join course_weeks w on w.id = l.week_id where w.course_id = '${id}'`
      )
    );
    for (const l of lessons) targets.push(l.id);
    await query(`delete from decks where course_id = '${id}'`);
    await must("SYSTEM_ADMIN", "DELETE", `/courses/${id}`, undefined, [404]);
  }
  if (targets.length) {
    const ids = targets.map((x) => `'${x}'`).join(", ");
    await query(`delete from notifications where target_id in (${ids})`);
  }
  await query(`delete from course_requests where title like '${title}%'`);
  let kosks = 0;
  const handle = `deneme-${tag}`;
  const ids = new Set(made?.kosk ? [made.kosk] : []);
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  for (const k of found?.items ?? [])
    if ((k.handle ?? "").replace(/^@/, "").toLowerCase() === handle)
      ids.add(k.id);
  for (const id of ids) {
    const r = await must(
      "SYSTEM_ADMIN",
      "DELETE",
      `/kosks/${id}`,
      undefined,
      [404]
    );
    if (r.status !== 404) kosks++;
  }
  if (existsSync(file)) rmSync(file);
  return courses.length || kosks || made
    ? `${courses.length} course(s) and ${kosks} köşk(s) removed`
    : "none";
}

async function make(tag, o) {
  await remove(tag);
  await must("KOSK_NAZIM", "GET", "/me"); // the nazım's row in tedrisat's users table
  const name = `Deneme ${tag} Köşkü`;
  const handle = `deneme-${tag}`;
  const created = await must("SYSTEM_ADMIN", "POST", "/kosks", {
    name,
    handle,
    alwaysRequireApproval: o.locked === true,
    managerUserIds: [subOf("KOSK_NAZIM")],
  });
  const made = {
    tag,
    kosk: created.body.id,
    koskName: name,
    handle,
    title: titleOf(tag),
    request: null,
  };
  keep(made); // at once: a failure below is still removable
  if (o.request) {
    const sent = await must(
      "SYSTEM_ADMIN",
      "POST",
      `/madrasahs/${seed().madrasah}/offsite-course-requests`,
      {
        koskId: made.kosk,
        title: `${made.title} talep`,
        reason:
          "Medrese dışında, bu köşkün nazımının açacağı bir ders istiyoruz; hocası köşkün kendi hocası olabilir.",
      }
    );
    made.request = sent.body.id;
    keep(made);
  }
  return made;
}

async function revoke(tag) {
  const made = recorded(tag);
  const r = await must(
    "SYSTEM_ADMIN",
    "DELETE",
    `/kosks/${made.kosk}/managers/${subOf("KOSK_NAZIM")}?successorUserId=${subOf("SYSTEM_ADMIN")}`,
    undefined,
    [404]
  );
  return r.status === 404 ? "KOSK_NAZIM had no seat" : "KOSK_NAZIM took off";
}

async function answer(tag) {
  const made = recorded(tag);
  if (!made.request)
    throw new Fail(`${tag} has no request: make it with --request`);
  const r = await must(
    "SYSTEM_ADMIN",
    "POST",
    `/course-requests/${made.request}/reject`,
    { reason: "Başka bir nazım yanıtladı." },
    [404, 409]
  );
  return r.status >= 400
    ? "the request was answered already"
    : "the request is rejected";
}

run("walk-data", async () => {
  const { rest, ...o } = options(process.argv.slice(2), {
    flags: ["locked", "request"],
  });
  const [verb, tag, ...more] = rest;
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(tag ?? "") || more.length)
    throw new Fail(
      `a tag is lower-case letters, digits and - (at most 41): ${usage}`,
      2
    );
  if (verb === "make") {
    console.log(JSON.stringify(await make(tag, o)));
  } else if (verb === "revoke") {
    console.log(`walk-data revoke ${tag}: ${await revoke(tag)}`);
  } else if (verb === "answer") {
    console.log(`walk-data answer ${tag}: ${await answer(tag)}`);
  } else if (verb === "remove") {
    console.log(`walk-data remove ${tag}: ${await remove(tag)}`);
  } else throw new Fail(usage, 2);
});
