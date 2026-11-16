#!/usr/bin/env node
// The köşks of nizam.kosks.browse's walks: köşks of the walk's own, so that the directory holds a hidden one to bring back, a passive one,
// a page past the first, and a köşk the köşk nazımı teaches in without managing. The seed's two köşks are never hidden, changed or
// removed. Everything goes through tedrisat's HTTP API as the people who may do it (the başnazım, the köşk nazımı); no SQL is used.
// It follows helpers/make-kosk.mjs (POST /kosks as the başnazım, the directory to find a köşk by its short
// name, DELETE /kosks/<id> to take it away with its role assignments) and helpers/remove-kosk.mjs.
//
//   node kosks.mjs make <tag> <part>...      makes the parts, each a köşk "Deneme köşkü <tag> <word>" with the short name deneme-<tag>-<word>:
//       hidden     gizli    unlisted ("Listelenmeyen"), nazım KOSK_NAZIM, hidden by the başnazım (Medaris yönetimi): the Geri al
//                           of a başnazım or a Medaris nazımı, and the sentence a köşk nazımı reads instead of a button
//       hiddenOwn  gizli    the same, hidden by KOSK_NAZIM himself (the köşk's own kademe): his own Geri al
//       passive    pasif    listed, made with nazım APPLICANT_G and then taken out of service by the başnazım: "Pasif", no nazım
//       many       01..12   twelve listed, active köşks (nazım APPLICANT_G): with the two seeded ones the list holds 14, two pages of 12
//       teach      ders     a köşk of APPLICANT_G with one published course of which KOSK_NAZIM is the hoca (helpers/course.mjs, tag <tag>c):
//                           KOSK_NAZIM teaches in a köşk he does not manage, so Köşkler shows "Verdiğiniz dersler"
//       hidden and hiddenOwn are the same köşk: ask for one of them. A tag made before is removed first, so a walk that died before its
//       teardown leaves nothing for the next one. Prints one line of JSON ({tag, parts, ids}); the same is written to
//       graphs/.local/made/<tag>.json.
//   node kosks.mjs status <tag> <word>       prints `kosk <tag> <word> HIDDEN|PASSIVE|ACTIVE|none restores=<n>` (n: the `kosk.restore` audit rows of
//                                            that köşk, read with a SELECT), for an `effects` check
//   node kosks.mjs restore <tag>             the başnazım brings the hidden köşk back (a second person acting while the page is open)
//   node kosks.mjs rehide <tag>              the başnazım brings it back and hides it again, so it is hidden by Medaris yönetimi
//   node kosks.mjs dismiss <tag>             the başnazım takes KOSK_NAZIM off the hidden köşk, naming himself the successor
//   node kosks.mjs remove <tag>              deletes every köşk whose short name starts deneme-<tag>- (and the course of `teach`); none is
//                                            fine, and a second run says `removed 0`
//   (a Medaris nazımı with no permission, for the page of a person the directory refuses: helpers/nazim.mjs up APPLICANT_F --codes none, and down)
//
// What it cannot undo: the audit rows of every creation, hide, restore and deletion (the API has no way to remove them; the seed does
// not depend on them). Run it by hand only under the replay lock (COMMON.md, round R2). Written without being run (the first walks are a
// later phase): the answers it reads (`id` of POST /kosks, `confirmation` of the deactivation preview) are from the domain graph and the
// controllers, not seen.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const COURSE = resolve(here, "../../../bindings/helpers/course.mjs");
const MADE = resolve(LOCAL, "made");
const CHIEF = "SYSTEM_ADMIN";
const NAZIM = "KOSK_NAZIM";
const SPARE = "APPLICANT_G"; // the manager of the made köşks that are not the köşk nazımı's
const usage =
  "usage: kosks.mjs make <tag> <hidden|hiddenOwn|passive|many|teach>... | status <tag> <word> | restore|rehide|dismiss|remove <tag>";

const prefixOf = (tag) => `deneme-${tag}-`;
const handleOf = (tag, word) => `${prefixOf(tag)}${word}`;
const nameOf = (tag, word) => `Deneme köşkü ${tag} ${word}`;
const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const bare = (h) => (h ?? "").replace(/^@/, "").toLowerCase();

/** The köşks of this tag, as the directory the başnazım reads lists them (hidden and passive ones too). */
async function withTag(tag) {
  const found = (
    await must(
      CHIEF,
      "GET",
      `/kosks/directory?q=${encodeURIComponent(`deneme-${tag}`)}&limit=50`
    )
  ).body;
  return (found.items ?? []).filter((k) =>
    bare(k.handle).startsWith(prefixOf(tag))
  );
}

const oneOf = async (tag, word) => {
  const k = (await withTag(tag)).find(
    (x) => bare(x.handle) === handleOf(tag, word)
  );
  if (!k) throw new Fail(`no köşk ${handleOf(tag, word)} (make ${tag} first)`);
  return k;
};

/** A person's row in tedrisat is made by their first call; naming them as a nazım needs it. */
const known = async (account) => {
  await must(account, "GET", "/me");
  return subOf(account);
};

async function open(tag, word, { manager, isPrivate = false }) {
  const created = (
    await must(CHIEF, "POST", "/kosks", {
      name: nameOf(tag, word),
      handle: handleOf(tag, word),
      isPrivate,
      managerUserIds: [await known(manager)],
    })
  ).body;
  if (!created?.id) throw new Fail("POST /kosks answered no id");
  return created.id;
}

async function remove(tag) {
  const same = await withTag(tag);
  if (existsSync(fileOf(`${tag}c`)) || existsSync(fileOf(tag))) {
    try {
      execFileSync(process.execPath, [COURSE, "remove", `${tag}c`], {
        stdio: "pipe",
      });
    } catch {
      // a course of `teach` that is already gone: DELETE /kosks/<id> takes any that is left
    }
  }
  for (const k of same) await must(CHIEF, "DELETE", `/kosks/${k.id}`);
  rmSync(fileOf(tag), { force: true });
  return `kosk remove ${tag} removed ${same.length}`;
}

async function make(tag, parts) {
  const known_ = ["hidden", "hiddenOwn", "passive", "many", "teach"];
  if (!parts.length || parts.some((p) => !known_.includes(p)))
    throw new Fail(usage, 2);
  if (parts.includes("hidden") && parts.includes("hiddenOwn"))
    throw new Fail("hidden and hiddenOwn are the same köşk: ask for one", 2);
  await remove(tag);
  const ids = {};
  for (const part of parts) {
    if (part === "hidden" || part === "hiddenOwn") {
      const id = await open(tag, "gizli", { manager: NAZIM, isPrivate: true });
      // POST /kosks/:id/hide: the köşk's own nazımı or the başnazım; the level it is hidden at is the hider's
      await must(
        part === "hidden" ? CHIEF : NAZIM,
        "POST",
        `/kosks/${id}/hide`
      );
      ids.gizli = id;
    } else if (part === "passive") {
      const id = await open(tag, "pasif", { manager: SPARE });
      const preview = (
        await must(CHIEF, "GET", `/kosks/${id}/deactivation-preview`)
      ).body;
      await must(CHIEF, "POST", `/kosks/${id}/deactivate`, {
        confirmation: preview.confirmation,
      });
      ids.pasif = id;
    } else if (part === "many") {
      ids.many = [];
      for (let i = 1; i <= 12; i++) {
        const word = String(i).padStart(2, "0");
        ids.many.push(await open(tag, word, { manager: SPARE }));
      }
    } else if (part === "teach") {
      const id = await open(tag, "ders", { manager: SPARE });
      // the course names KOSK_NAZIM its hoca: he teaches in a köşk he does not manage
      execFileSync(
        process.execPath,
        [
          COURSE,
          "make",
          `${tag}c`,
          "--kosk",
          id,
          "--hoca",
          NAZIM,
          "--weeks",
          "1",
          "--lessons",
          "1",
        ],
        { stdio: "pipe" }
      );
      ids.ders = id;
    }
  }
  const made = { tag, parts, ids };
  mkdirSync(MADE, { recursive: true });
  writeFileSync(fileOf(tag), `${JSON.stringify(made, null, 2)}\n`);
  return JSON.stringify(made);
}

async function status(tag, word) {
  const k = (await withTag(tag)).find(
    (x) => bare(x.handle) === handleOf(tag, word)
  );
  if (!k) return `kosk ${tag} ${word} none restores=0`;
  // one `kosk.restore` audit row per restore of this köşk (kosk-admin.repository.ts:525), read with a SELECT
  const rows = await query(
    `select count(*) as n from audit_log where action = 'kosk.restore' and entity_id = '${k.id}'`
  );
  const n = Number(
    JSON.parse(String(rows).trim().split("\n")[0] || "{}").n ?? 0
  );
  return `kosk ${tag} ${word} ${k.status} restores=${n}`;
}

run("kosks", async () => {
  const [command, ...args] = process.argv.slice(2);
  const [tag, ...rest] = args;
  if (!command || !tag || !/^[a-z0-9]+$/.test(tag)) throw new Fail(usage, 2);
  if (command === "make") console.log(await make(tag, rest));
  else if (command === "remove" && !rest.length) console.log(await remove(tag));
  else if (command === "status" && rest.length === 1)
    console.log(await status(tag, rest[0]));
  else if (command === "restore" && !rest.length) {
    const k = await oneOf(tag, "gizli");
    await must(CHIEF, "POST", `/kosks/${k.id}/restore`);
    console.log(`restored ${tag}`);
  } else if (command === "rehide" && !rest.length) {
    const k = await oneOf(tag, "gizli");
    await must(CHIEF, "POST", `/kosks/${k.id}/restore`);
    await must(CHIEF, "POST", `/kosks/${k.id}/hide`);
    console.log(`rehidden ${tag}`);
  } else if (command === "dismiss" && !rest.length) {
    const k = await oneOf(tag, "gizli");
    await must(
      CHIEF,
      "DELETE",
      `/kosks/${k.id}/managers/${subOf(NAZIM)}?successorUserId=${subOf(CHIEF)}`
    );
    console.log(`dismissed ${tag}`);
  } else throw new Fail(usage, 2);
});
