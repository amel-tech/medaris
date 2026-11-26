#!/usr/bin/env node
// The data of nizam.madrasahs.passivate's walks: a medrese of the walk's own, made through tedrisat's HTTP API as the başnazım, and taken
// away again by its tag. The walk passivates it, so it is never the seeded medrese (other flows read that one). Run from graphs/bindings/
// (the replay's working directory):
//
//   node ../nizam/madrasahs/passivate/passivate-data.mjs make <tag> [--head ACCOUNT]
//   node ../nizam/madrasahs/passivate/passivate-data.mjs passivate <tag>
//   node ../nizam/madrasahs/passivate/passivate-data.mjs delete <tag>
//   node ../nizam/madrasahs/passivate/passivate-data.mjs remove <tag>
//
// make       Opens the medrese "Deneme medresesi <tag>" (short name deneme-<tag>) as the başnazım, with --head (default APPLICANT_C, a spare
//            talebe account of the stack) as its başmüderris, and gives it a hosting right in the seed's second köşk (Kubbealtı Köşkü,
//            `seed.kosk2`, which no seeded flow reads), which is what lets `helpers/course.mjs make <tag> --madrasah <id> --kosk <kosk2>` open
//            courses of it there without touching the seeded köşk's own list. Prints one JSON line
//            {"tag","madrasah","name","handle","head","kosks":[ids]} and writes it to graphs/.local/made/<tag>.json, which a binding reads as
//            a data source (`made: { json: ../.local/made/<tag>.json }`, then `{made.madrasah}`). Making a tag again removes the old one
//            first; the file is written the moment the medrese exists, so a crash half way is still removable.
// passivate  What a second başnazım does behind the page's back: reads the deactivation preview and posts its confirmation, so the medrese is
//            passive (the head's post is revoked, `passive_since` is set). `already` when it was. The walk uses it for the "someone passivated
//            it first" branches; the person's own press then meets MADRASAH_ALREADY_PASSIVE (or the preview's `alreadyPassive`).
// delete     DELETE /madrasahs/:id as the başnazım: the medrese is gone behind the page's back (its hosting right and head go with it, its
//            courses stay in their köşk). The file stays, so `remove` still deletes what is left.
// remove     Deletes every course the medrese still has (as the başnazım), then the medrese itself, then the file. Safe to run twice: a tag
//            with nothing recorded is `none`, a medrese or a course that is already gone is fine. The courses a walk makes with
//            helpers/course.mjs have their own tag and their own `remove`, which runs first in `teardown`.
//
// What a walk leaves and this cannot remove: audit_log rows (madrasah.create, hosting_right.grant, madrasah.deactivate, madrasah.delete,
// user.lookup). NOT RUN: the owner's word is that nothing writes to the stack before the walk phase; every call below is read from the
// controllers (madrasah.controller.ts:399, 527, 549, 691; hosting.controller.ts:92) and from the peer helper
// graphs/nazar/courses/open/walk-data.mjs. Run it under the replay lock when walks are running and you run it by hand.
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
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: passivate-data.mjs make <tag> [--head ACCOUNT] | passivate <tag> | delete <tag> | remove <tag>";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);

function keep(made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(made.tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

function recorded(tag) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(`no medrese recorded for ${tag}: run make first`);
  return JSON.parse(readFileSync(fileOf(tag), "utf8"));
}

async function remove(tag) {
  if (!existsSync(fileOf(tag))) return "none";
  const made = JSON.parse(readFileSync(fileOf(tag), "utf8"));
  const courses = [];
  if (made.madrasah) {
    const list = await must(
      "SYSTEM_ADMIN",
      "GET",
      `/madrasahs/${made.madrasah}/courses`,
      undefined,
      [403, 404] // a medrese already deleted behind the page: nothing to list
    );
    if (list.status === 200 && Array.isArray(list.body))
      courses.push(...list.body.map((c) => c.id));
    for (const id of courses)
      await must("SYSTEM_ADMIN", "DELETE", `/courses/${id}`, undefined, [404]);
    await must(
      "SYSTEM_ADMIN",
      "DELETE",
      `/madrasahs/${made.madrasah}`,
      undefined,
      [404]
    );
  }
  rmSync(fileOf(tag));
  return `${made.madrasah ?? "no medrese"} removed with ${courses.length} course(s) left over`;
}

async function make(tag, o) {
  await remove(tag);
  const head = o.head ?? "APPLICANT_C";
  const headSub = subOf(head);
  await must(head, "GET", "/me"); // the head's row in tedrisat's users table
  const name = `Deneme medresesi ${tag}`;
  const handle = `deneme-${tag}`.slice(0, 60);
  const created = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name,
    handle,
    headMuderrisUserId: headSub,
  });
  const made = {
    tag,
    madrasah: created.body.id,
    name,
    handle,
    head,
    kosks: [],
  };
  keep(made); // at once: a failure below is still removable
  await must("SYSTEM_ADMIN", "POST", `/kosks/${seed().kosk2}/hosting-rights`, {
    madrasahId: made.madrasah,
  });
  made.kosks.push(seed().kosk2);
  keep(made);
  return made;
}

async function passivate(tag) {
  const made = recorded(tag);
  const preview = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/madrasahs/${made.madrasah}/deactivation-preview`
  );
  if (preview.body.alreadyPassive) return "already";
  await must("SYSTEM_ADMIN", "POST", `/madrasahs/${made.madrasah}/deactivate`, {
    confirmation: preview.body.confirmation,
  });
  return "passivated";
}

async function del(tag) {
  const made = recorded(tag);
  const r = await must(
    "SYSTEM_ADMIN",
    "DELETE",
    `/madrasahs/${made.madrasah}`,
    undefined,
    [404]
  );
  return r.status === 404 ? "already gone" : "deleted";
}

run("passivate-data", async () => {
  const { rest, ...o } = options(process.argv.slice(2), { values: ["head"] });
  const [verb, tag, ...more] = rest;
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(tag ?? "") || more.length)
    throw new Fail(
      `a tag is lower-case letters, digits and - (at most 41): ${usage}`,
      2
    );
  if (verb === "make") {
    console.log(JSON.stringify(await make(tag, o)));
  } else if (verb === "passivate") {
    console.log(`passivate-data passivate ${tag}: ${await passivate(tag)}`);
  } else if (verb === "delete") {
    console.log(`passivate-data delete ${tag}: ${await del(tag)}`);
  } else if (verb === "remove") {
    console.log(`passivate-data remove ${tag}: ${await remove(tag)}`);
  } else throw new Fail(usage, 2);
});
