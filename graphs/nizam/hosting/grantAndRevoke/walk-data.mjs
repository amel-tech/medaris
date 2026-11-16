#!/usr/bin/env node
// The data of nizam.hosting.grantAndRevoke's walks: a köşk of the walk's own, a medrese of the walk's own, and (for the walks that need
// them) a köşk the köşk nazımı does not manage and a second medrese with a right. Made through tedrisat's HTTP API as the başnazım and
// taken away again by its tag. The seeded köşks and the seeded medrese are other flows' data (their hosting rights, their nazar lists), and
// this flow gives and withdraws rights, so it never does either there. Run from graphs/bindings/ (the replay's working directory):
//
//   node ../nizam/hosting/grantAndRevoke/walk-data.mjs make <tag> [--held] [--other] [--stranger] [--head ACCOUNT]
//   node ../nizam/hosting/grantAndRevoke/walk-data.mjs withdraw <tag> [KEEP|HIDE]
//   node ../nizam/hosting/grantAndRevoke/walk-data.mjs hide <tag>
//   node ../nizam/hosting/grantAndRevoke/walk-data.mjs remove <tag>
//
// make      Opens the köşk "Barındırma Deneme Köşkü" (short name barindirma-<tag>) with KOSK_NAZIM as its one nazım, so the köşk nazımı
//           of the stack manages it and nothing else of theirs is touched, and the medrese "Deneme medresesi <tag>" (short name
//           deneme-<tag>) with --head (default APPLICANT_G, a spare talebe account) as its başmüderris. Then:
//             --held      gives the medrese the right in the köşk (POST /kosks/:id/hosting-rights as the başnazım), so that
//                         `helpers/course.mjs make <tag>-ders --madrasah <id> --kosk <kosk>` can open courses of it there;
//             --other     a second medrese "Deneme medresesi <tag> ikinci" (short name deneme-<tag>-2, head APPLICANT_F) that also holds
//                         the right, given after the first so that it is the second row of the table;
//             --stranger  a second köşk "Başka Deneme Köşkü" (short name baska-<tag>) whose one nazım is APPLICANT_H, which KOSK_NAZIM
//                         does not manage: the "another köşk's page" of the story.
//           Prints one JSON line {"tag","kosk","koskName","koskHandle","madrasah","name","handle","head","headName","other","stranger"}
//           and writes it to graphs/.local/made/<tag>.json, which a binding reads as a data source (`made: { json: ../.local/made/<tag>.json }`,
//           then `{made.kosk}`). Making a tag again removes the old one first; the file is written the moment the first row exists, so a
//           crash half way is still removable (and `remove` also looks the short names up, for a crash before the file).
// withdraw  The başnazım withdraws the right (default KEEP: the medrese's courses stay in the köşk). `no right` when it held none. The
//           walks use it to put a medrese that has open courses in the köşk back among the ones that hold no right (`park`), and as the
//           "someone withdrew it first" of `notHeld`.
// hide      The başnazım hides the medrese (POST /madrasahs/:id/hide): the "medrese is gone behind the page" of `madrasahGone`.
//           `already hidden` when it was.
// remove    Deletes the köşks (DELETE /kosks/:id takes the köşk with its courses, its hosting rights and its nazım's role in one
//           transaction) and then the medreses (DELETE /madrasahs/:id), the file last. Safe to run twice: a tag with nothing left is
//           `none`. The courses a walk made with helpers/course.mjs have their own tag and their own `remove`, which runs first in `teardown`.
//
// What a walk leaves behind and this cannot remove: audit_log rows (kosk.create, kosk.delete, madrasah.create, madrasah.delete,
// hosting_right.grant and .revoke, madrasah.hide, course.open, user.lookup). NOT RUN: the owner's word is that nothing writes to the stack
// before the walk phase; every call below is read from the controllers (kosk.controller.ts:310, 367; madrasah.controller.ts:399, 495, 691;
// hosting.controller.ts:92, 143) and from the peer helpers nizam/madrasahs/passivate/passivate-data.mjs and
// nizam/shell/noAccessAndNotFound/make-kosk.mjs. Run it under the replay lock when walks are running and you run it by hand.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  Fail,
  LOCAL,
  must,
  nameOf,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: walk-data.mjs make <tag> [--held] [--other] [--stranger] [--head ACCOUNT] | withdraw <tag> [KEEP|HIDE] | hide <tag> | remove <tag>";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const KOSK_NAME = "Barındırma Deneme Köşkü";
const STRANGER_NAME = "Başka Deneme Köşkü";
const handlesOf = (tag) => ({
  kosk: `barindirma-${tag}`,
  stranger: `baska-${tag}`,
  madrasah: `deneme-${tag}`,
  other: `deneme-${tag}-2`,
});

function keep(made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(made.tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

function recorded(tag) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(`nothing recorded for ${tag}: run make first`);
  return JSON.parse(readFileSync(fileOf(tag), "utf8"));
}

/** The ids of the köşks or medreses of that short name, as the directory the başnazım reads lists them (hidden ones too). */
async function idsWithHandle(kind, handle) {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/${kind}/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  return (found.items ?? [])
    .filter((x) => (x.handle ?? "").replace(/^@/, "").toLowerCase() === handle)
    .map((x) => x.id);
}

async function remove(tag) {
  const h = handlesOf(tag);
  const made = existsSync(fileOf(tag)) ? recorded(tag) : {};
  const kosks = new Set(
    [made.kosk, made.stranger]
      .filter(Boolean)
      .concat(
        await idsWithHandle("kosks", h.kosk),
        await idsWithHandle("kosks", h.stranger)
      )
  );
  const madrasahs = new Set(
    [made.madrasah, made.other]
      .filter(Boolean)
      .concat(
        await idsWithHandle("madrasahs", h.madrasah),
        await idsWithHandle("madrasahs", h.other)
      )
  );
  const seeded = new Set([seed().kosk, seed().kosk2, seed().madrasah]);
  for (const id of [...kosks, ...madrasahs])
    if (seeded.has(id))
      throw new Fail(`${id} is a seeded köşk or medrese: never removed`);
  // the köşk first: its courses, its rights and its nazım's role go with it, so no course is left without a köşk to be deleted from
  for (const id of kosks)
    await must("SYSTEM_ADMIN", "DELETE", `/kosks/${id}`, undefined, [404]);
  for (const id of madrasahs)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  rmSync(fileOf(tag), { force: true });
  return kosks.size + madrasahs.size === 0
    ? "none"
    : `removed ${kosks.size} köşk(s) and ${madrasahs.size} medrese(s)`;
}

async function openMadrasah(name, handle, headAccount) {
  await must(headAccount, "GET", "/me"); // the head's row in tedrisat's users table
  const created = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name,
    handle,
    headMuderrisUserId: subOf(headAccount),
  });
  return created.body.id;
}

async function make(tag, o) {
  await remove(tag);
  const h = handlesOf(tag);
  const head = o.head ?? "APPLICANT_G";
  const made = {
    tag,
    kosk: null,
    koskName: KOSK_NAME,
    koskHandle: h.kosk,
    madrasah: null,
    name: `Deneme medresesi ${tag}`,
    handle: h.madrasah,
    head,
    headName: await nameOf(head),
    other: null,
    stranger: null,
  };
  const kosk = await must("SYSTEM_ADMIN", "POST", "/kosks", {
    name: KOSK_NAME,
    handle: h.kosk,
    managerUserIds: [subOf("KOSK_NAZIM")],
  });
  made.kosk = kosk.body.id;
  keep(made); // at once: a failure below is still removable
  made.madrasah = await openMadrasah(made.name, h.madrasah, head);
  keep(made);
  if (o.held)
    await must("SYSTEM_ADMIN", "POST", `/kosks/${made.kosk}/hosting-rights`, {
      madrasahId: made.madrasah,
    });
  if (o.other) {
    made.other = await openMadrasah(
      `${made.name} ikinci`,
      h.other,
      "APPLICANT_F"
    );
    keep(made);
    await must("SYSTEM_ADMIN", "POST", `/kosks/${made.kosk}/hosting-rights`, {
      madrasahId: made.other,
    });
  }
  if (o.stranger) {
    await must("APPLICANT_H", "GET", "/me");
    const other = await must("SYSTEM_ADMIN", "POST", "/kosks", {
      name: STRANGER_NAME,
      handle: h.stranger,
      managerUserIds: [subOf("APPLICANT_H")],
    });
    made.stranger = other.body.id;
    keep(made);
  }
  return made;
}

async function withdraw(tag, action) {
  if (action !== "KEEP" && action !== "HIDE")
    throw new Fail("the answer for the open courses is KEEP or HIDE", 2);
  const made = recorded(tag);
  const r = await must(
    "SYSTEM_ADMIN",
    "DELETE",
    `/kosks/${made.kosk}/hosting-rights/${made.madrasah}?coursesAction=${action}`,
    undefined,
    [404]
  );
  return r.status === 404 ? "no right" : `withdrawn (${action})`;
}

async function hide(tag) {
  const made = recorded(tag);
  const r = await must(
    "SYSTEM_ADMIN",
    "POST",
    `/madrasahs/${made.madrasah}/hide`,
    undefined,
    [409, 404]
  );
  return r.status === 200 || r.status === 201 ? "hidden" : "already hidden";
}

run("walk-data", async () => {
  const { rest, ...o } = options(process.argv.slice(2), {
    values: ["head"],
    flags: ["held", "other", "stranger"],
  });
  const [verb, tag, extra, ...more] = rest;
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(tag ?? "") || more.length)
    throw new Fail(
      `a tag is lower-case letters, digits and - (at most 31): ${usage}`,
      2
    );
  if (verb === "make") {
    console.log(JSON.stringify(await make(tag, o)));
  } else if (verb === "withdraw") {
    console.log(
      `walk-data withdraw ${tag}: ${await withdraw(tag, extra ?? "KEEP")}`
    );
  } else if (verb === "hide") {
    console.log(`walk-data hide ${tag}: ${await hide(tag)}`);
  } else if (verb === "remove") {
    console.log(`walk-data remove ${tag}: ${await remove(tag)}`);
  } else throw new Fail(usage, 2);
});
