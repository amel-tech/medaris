#!/usr/bin/env node
// The data of nazar.courses.open's walks: a medrese of the walk's own, made through tedrisat's HTTP API and taken away again by its tag. The
// seeded medrese is other flows' data (its policies, its köşk, its course count), and this flow opens courses and sets policies, so it never
// does either there. Run from graphs/bindings/ (the replay's working directory):
//
//   node ../nazar/courses/open/walk-data.mjs make <tag> [--kosks one|two|none] [--policies closed,approval] [--head ACCOUNT]
//   node ../nazar/courses/open/walk-data.mjs revoke <tag> <first|kubbealti|suleymaniye>
//   node ../nazar/courses/open/walk-data.mjs remove <tag>
//
// make    Opens the medrese "Deneme medresesi <tag>" (handle deneme-<tag>) as the başnazım, with --head (default APPLICANT_E, a spare
//         talebe account of the stack) as its başmüderris, and:
//           --kosks   which köşks give it a hosting right: `one` the seed's first (Süleymaniye Köşkü), `two` the seed's second as well
//                     (Kubbealtı Köşkü, listed first by name), `none` neither (default: one);
//           --policies  `closed` and/or `approval`: the medrese's policies closedCourseRequired and alwaysApproval, set through PATCH
//                     /madrasahs/:id/settings.
//         Prints one JSON line {"tag","madrasah","name","head","kosks":[ids]} and writes it to graphs/.local/made/<tag>.json, which a binding
//         reads as a data source (`made: { json: ../.local/made/<tag>.json }`, then `{made.madrasah}`). Making a tag again removes the old
//         one first; the file is written the moment the medrese exists, so a crash half way is still removable.
// revoke  The köşk takes its hosting right back (KEEP: the medrese's courses stay), as a köşk's nazım or the başnazım may: the walk of
//         "a köşk that took its right back after the page opened" runs it between filling the form and pressing "Dersi aç". `first` is the
//         köşk the page lists first and chooses: Kubbealtı Köşkü of two, the only one of one.
// remove  Deletes every course of the medrese the walk opened (as the başnazım), the medrese itself (its hosting rights, settings and role
//         assignments go with it), the notifications that point at those courses (no route deletes one: the one SQL write, with the role
//         assignments of the hocas if the course delete left any), and the file. Safe to run twice: a tag with nothing recorded is `none`.
//
// What a walk leaves behind and this cannot remove: audit_log rows (course.open, madrasah.create/delete, hosting_right.*, user.lookup) and the
// Keycloak-side nothing (no account is made). Run it under the replay lock when walks are running and you run it by hand.
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
  call,
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
  "usage: walk-data.mjs make <tag> [--kosks one|two|none] [--policies closed,approval] [--head ACCOUNT] | revoke <tag> <first|kubbealti|suleymaniye> | remove <tag>";
const fileOf = (tag) => resolve(MADE, `${tag}.json`);

function keep(made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(made.tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

const koskOf = (name, made) => {
  if (name === "first") {
    if (!made.kosks?.length)
      throw new Fail("the medrese has no hosting right to take back");
    return made.kosks[0];
  }
  if (name === "suleymaniye") return seed().kosk;
  if (name === "kubbealti") return seed().kosk2;
  throw new Fail(`a köşk is first, kubbealti or suleymaniye, not ${name}`, 2);
};

async function remove(tag) {
  if (!existsSync(fileOf(tag))) return "none";
  const made = JSON.parse(readFileSync(fileOf(tag), "utf8"));
  const courses = [];
  if (made.madrasah) {
    const list = await call(
      "SYSTEM_ADMIN",
      "GET",
      `/madrasahs/${made.madrasah}/courses`
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
  if (courses.length) {
    const ids = courses.map((x) => `'${x}'`).join(", ");
    await query(`delete from notifications where target_id in (${ids})`);
    try {
      await query(`delete from role_assignments where scope_id in (${ids})`);
    } catch {
      // a schema that names it otherwise: the course delete is the API's own cleanup, and this was only a safety net
    }
  }
  rmSync(fileOf(tag));
  return `${made.madrasah ?? "no medrese"} removed with ${courses.length} course(s)`;
}

async function make(tag, o) {
  await remove(tag);
  const head = o.head ?? "APPLICANT_E";
  const which = o.kosks ?? "one";
  if (!["one", "two", "none"].includes(which))
    throw new Fail("--kosks is one, two or none", 2);
  const policies = (o.policies ?? "").split(",").filter(Boolean);
  for (const p of policies)
    if (!["closed", "approval"].includes(p))
      throw new Fail("--policies is closed and/or approval", 2);
  const headSub = subOf(head);
  await must(head, "GET", "/me"); // the head's row in tedrisat's users table
  const name = `Deneme medresesi ${tag}`;
  const created = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name,
    handle: `deneme-${tag}`.slice(0, 60),
    headMuderrisUserId: headSub,
  });
  const made = {
    tag,
    madrasah: created.body.id,
    name,
    head,
    kosks: [],
  };
  keep(made); // at once: a failure below is still removable
  const kosks =
    which === "two"
      ? [seed().kosk2, seed().kosk]
      : which === "one"
        ? [seed().kosk]
        : [];
  for (const kosk of kosks) {
    await must("SYSTEM_ADMIN", "POST", `/kosks/${kosk}/hosting-rights`, {
      madrasahId: made.madrasah,
    });
    made.kosks.push(kosk);
    keep(made);
  }
  if (policies.length)
    await must(
      "SYSTEM_ADMIN",
      "PATCH",
      `/madrasahs/${made.madrasah}/settings`,
      {
        policies: {
          closedCourseRequired: policies.includes("closed"),
          alwaysApproval: policies.includes("approval"),
        },
      }
    );
  return made;
}

async function revoke(tag, name) {
  if (!existsSync(fileOf(tag)))
    throw new Fail(`no medrese recorded for ${tag}`);
  const made = JSON.parse(readFileSync(fileOf(tag), "utf8"));
  const r = await must(
    "SYSTEM_ADMIN",
    "DELETE",
    `/kosks/${koskOf(name, made)}/hosting-rights/${made.madrasah}?coursesAction=KEEP`,
    undefined,
    [404]
  );
  return r.status === 404
    ? `${name} had no right`
    : `${name} took its right back`;
}

run("walk-data", async () => {
  const { rest, ...o } = options(process.argv.slice(2), {
    values: ["kosks", "policies", "head"],
  });
  const [verb, tag, extra] = rest;
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(tag ?? ""))
    throw new Fail(
      `a tag is lower-case letters, digits and - (at most 41): ${usage}`,
      2
    );
  if (verb === "make") {
    console.log(JSON.stringify(await make(tag, o)));
  } else if (verb === "revoke") {
    console.log(`walk-data revoke ${tag}: ${await revoke(tag, extra)}`);
  } else if (verb === "remove") {
    console.log(`walk-data remove ${tag}: ${await remove(tag)}`);
  } else throw new Fail(usage, 2);
});
