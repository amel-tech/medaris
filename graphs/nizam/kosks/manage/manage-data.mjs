#!/usr/bin/env node
// The köşk of nizam.kosks.manage's walks, put into the shape a scenario starts from, and what a colleague does to it behind the
// page. The köşk itself is made by ../../shell/noAccessAndNotFound/make-kosk.mjs (tag kmanage), which writes graphs/.local/made/<tag>.json;
// this helper reads the köşk's id from that file and goes through tedrisat's HTTP API as the başnazım (SYSTEM_ADMIN), the way the
// pages do. No SQL. Nothing secret is printed.
//
//   node manage-data.mjs rights <tag>
//       gives the seed's medrese a hosting right in the köşk (POST /kosks/:id/hosting-rights; idempotent)
//   node manage-data.mjs status <tag> hidden|passive
//       hidden: POST /kosks/:id/hide. passive: GET .../deactivation-preview, then POST .../deactivate with the confirmation it gave
//       (the köşk's nazımları are taken off the post)
//   node manage-data.mjs elsewhere <tag> hide|restore
//       the same hide or restore, done while a page that was read before still shows the old state (the events HIDDEN_ELSEWHERE and
//       RESTORED_ELSEWHERE of the flow); a hide of a köşk already hidden, or a restore of one that is not, is a fault of the walk
//   node manage-data.mjs second <tag> <ACCOUNT>
//       adds a second nazım (POST /kosks/:id/nazims), which changes the numbers the passivation dialog read (IMPACT_CHANGED)
//
// Each prints one line, `<command> <tag> ...`, for the binding's `expect`. The köşk, its courses and every nazım go with it when
// make-kosk.mjs removes it (DELETE /kosks/:id), so there is no teardown here.
//
// Written without being run (the first walks are a later phase); its calls are the ones the pages make, read from
// apps/tedrisat/src/kosk/kosk-admin.controller.ts and apps/tedrisat/src/hosting/hosting.controller.ts.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const CHIEF = "SYSTEM_ADMIN";
const usage =
  "usage: manage-data.mjs rights <tag> | status <tag> hidden|passive | elsewhere <tag> hide|restore | second <tag> <ACCOUNT>";

/** The köşk make-kosk.mjs made under this tag. */
function koskOf(tag) {
  const file = resolve(LOCAL, "made", `${tag}.json`);
  if (!existsSync(file))
    throw new Fail(
      `${file} does not exist: make-kosk.mjs make ${tag} has not run`
    );
  const made = JSON.parse(readFileSync(file, "utf8"));
  if (!made.kosk) throw new Fail(`${file} names no köşk`);
  return made.kosk;
}

async function rights(tag) {
  const kosk = koskOf(tag);
  await must(CHIEF, "POST", `/kosks/${kosk}/hosting-rights`, {
    madrasahId: seed().madrasah,
  });
  const held = (await must(CHIEF, "GET", `/kosks/${kosk}/hosting-rights`)).body;
  if (!Array.isArray(held) || held.length !== 1)
    throw new Fail(
      `rights ${tag}: ${Array.isArray(held) ? held.length : "no"} hosting rights held, wanted 1`
    );
  return `rights ${tag} held`;
}

async function status(tag, wanted) {
  const kosk = koskOf(tag);
  if (wanted === "hidden") {
    await must(CHIEF, "POST", `/kosks/${kosk}/hide`);
  } else if (wanted === "passive") {
    const preview = (
      await must(CHIEF, "GET", `/kosks/${kosk}/deactivation-preview`)
    ).body;
    await must(CHIEF, "POST", `/kosks/${kosk}/deactivate`, {
      confirmation: preview.confirmation,
    });
  } else throw new Fail(usage, 2);
  const now = (await must(CHIEF, "GET", `/kosks/${kosk}/overview`)).body.status;
  if (now !== wanted.toUpperCase())
    throw new Fail(
      `status ${tag}: the köşk is ${now}, wanted ${wanted.toUpperCase()}`
    );
  return `status ${tag} ${now}`;
}

async function elsewhere(tag, what) {
  const kosk = koskOf(tag);
  if (what !== "hide" && what !== "restore") throw new Fail(usage, 2);
  await must(CHIEF, "POST", `/kosks/${kosk}/${what}`);
  return `elsewhere ${tag} ${what}`;
}

async function second(tag, account) {
  const kosk = koskOf(tag);
  await must(CHIEF, "POST", `/kosks/${kosk}/nazims`, {
    userIds: [subOf(account)],
  });
  return `second ${tag} ${accountKey(account)}`;
}

run("manage-data", async () => {
  const [command, tag, arg, ...more] = process.argv.slice(2);
  if (!command || !tag || more.length) throw new Fail(usage, 2);
  if (!/^[a-z0-9]+$/.test(tag))
    throw new Fail("a tag is lower-case letters and digits", 2);
  if (command === "rights" && arg === undefined) console.log(await rights(tag));
  else if (command === "status" && arg) console.log(await status(tag, arg));
  else if (command === "elsewhere" && arg)
    console.log(await elsewhere(tag, arg));
  else if (command === "second" && arg) console.log(await second(tag, arg));
  else throw new Fail(usage, 2);
});
