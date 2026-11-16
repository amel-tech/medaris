#!/usr/bin/env node
// A Medaris nazımı of this flow's own, for a binding's `setup`, `teardown` and `events` (`run` commands: no page exists then).
// No helper in graphs/bindings/helpers/ appoints one, so this is the flow-local one (the orchestrator may move it there). It goes
// through tedrisat's HTTP API as the başnazım (SYSTEM_ADMIN), the way the Medaris nazımları page does, and uses no SQL.
//
//   node nazim.mjs up <ACCOUNT> --codes <code,code | none> [--deck <title>]
//       appoints the account as a Medaris nazımı holding exactly these platform permissions (POST /nizam/medaris-nazims, or
//       PUT .../grants when it already holds the seat, so a walk that died before its teardown is put right). `--deck` also
//       makes the account's own deck of that title and asks for its publication, so the deck queue holds one request.
//   node nazim.mjs drop <ACCOUNT> --code <code>
//       the başnazım takes one permission away: PUT .../grants with the rest (the other permissions keep their rows)
//   node nazim.mjs lacks <ACCOUNT> <code>
//       fails when the account still holds the code (GET /me/permissions as the account); for an `effects` check
//   node nazim.mjs down <ACCOUNT> [--deck <title>]
//       dismisses the account (DELETE /nizam/medaris-nazims/<id>, answering "Düşür" to anything it handed on, which is nothing
//       here) and removes the deck of that title; each part on its own, none is a failure
//
// <ACCOUNT> is the role key of graphs/.local/accounts.env (APPLICANT_F) or the binding's name for it (applicantF). It must be a
// spare talebe: never the seed's own Medaris nazımı (its grants are not this flow's to change). Prints one line, `up|dropped|lacks|
// down <ACCOUNT> ...`, for the binding's `expect`. Nothing secret is printed.
import {
  accountKey,
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const CHIEF = "SYSTEM_ADMIN";

const rows = async () =>
  (await must(CHIEF, "GET", "/nizam/medaris-nazims")).body;
const rowOf = async (sub) => (await rows()).find((r) => r.user?.id === sub);
const codesOf = (row) => (row?.permissions ?? []).map((p) => p.code);
const csv = (codes) => (codes.length ? codes.join(",") : "none");

// the platform group the row holds, if any: a PUT replaces group and codes together, so it is sent back as it is
const platformGroupId = (row) =>
  (row?.groups ?? []).find((g) => g.scope === "PLATFORM")?.id ?? null;

async function up(account, { codes, deck }) {
  if (!codes) throw new Fail("up needs --codes <code,code | none>", 2);
  const wanted = codes === "none" ? [] : codes.split(",").map((c) => c.trim());
  const sub = subOf(account);
  await must(account, "GET", "/me"); // tedrisat makes the person's row at their first call; the appointment names it
  const held = await rowOf(sub);
  if (held) {
    // no group and no end: the body of an appointment that gives single permissions and no date
    await must(CHIEF, "PUT", `/nizam/medaris-nazims/${sub}/grants`, {
      permissions: wanted,
    });
  } else {
    await must(CHIEF, "POST", "/nizam/medaris-nazims", {
      userId: sub,
      permissions: wanted,
    });
  }
  const now = codesOf(await rowOf(sub));
  const same =
    now.length === wanted.length && wanted.every((c) => now.includes(c));
  if (!same)
    throw new Fail(
      `up ${accountKey(account)}: holds ${csv(now)}, wanted ${csv(wanted)}`
    );
  const queued = deck ? await queueDeck(account, deck) : "";
  console.log(`up ${accountKey(account)} codes=${csv(now)}${queued}`);
}

async function drop(account, { code }) {
  if (!code) throw new Fail("drop needs --code <code>", 2);
  const sub = subOf(account);
  const row = await rowOf(sub);
  if (!row) throw new Fail(`drop ${accountKey(account)}: not a Medaris nazımı`);
  const before = codesOf(row);
  if (!before.includes(code))
    throw new Fail(
      `drop ${accountKey(account)}: does not hold ${code} (holds ${csv(before)})`
    );
  const rest = before.filter((c) => c !== code);
  const groupId = platformGroupId(row);
  await must(CHIEF, "PUT", `/nizam/medaris-nazims/${sub}/grants`, {
    ...(groupId ? { groupId } : {}),
    permissions: rest,
  });
  console.log(`dropped ${accountKey(account)} ${code}; holds ${csv(rest)}`);
}

async function lacks(account, code) {
  if (!code) throw new Fail("lacks needs a code", 2);
  const held =
    (await must(account, "GET", "/me/permissions")).body.permissions ?? [];
  if (held.includes(code))
    throw new Fail(`lacks ${accountKey(account)}: still holds ${code}`);
  console.log(`lacks ${accountKey(account)} ${code}`);
}

// ---- a deck that waits for publication, owned by the account itself ----
// GET /flashcard/decks?isPublic=false answers the caller's own non-public decks (a waiting one is not public yet)
const ownDecks = async (account, title) =>
  (
    (await must(account, "GET", "/flashcard/decks?isPublic=false")).body ?? []
  ).filter((d) => d.title === title);

async function queueDeck(account, title) {
  const found = await ownDecks(account, title);
  let deck = found[0];
  if (!deck)
    deck = (await must(account, "POST", "/flashcard/decks", { title })).body;
  if (deck.publishStatus !== "PENDING")
    await must(account, "POST", `/flashcard/decks/${deck.id}/publish-request`);
  return ` deck=queued`;
}

async function unqueueDeck(account, title) {
  const found = await ownDecks(account, title);
  for (const d of found)
    await must(account, "DELETE", `/flashcard/decks/${d.id}`);
  return found.length;
}

async function down(account, { deck }) {
  const sub = subOf(account);
  const said = [];
  const failed = [];
  try {
    const row = await rowOf(sub);
    if (!row) said.push("dismissed=none");
    else {
      // what the person handed on to someone else must be answered; this nazım hands nothing on, so the list is empty
      const given =
        (await must(CHIEF, "GET", `/nizam/medaris-nazims/${sub}/given`)).body ??
        [];
      const decisions = given
        .filter(
          (g) =>
            (g.kind === "ROLE" || g.kind === "GRANT") && g.to && g.to.id !== sub
        )
        .map((g) => ({ kind: g.kind, id: g.id, action: "DROP" }));
      await must(CHIEF, "DELETE", `/nizam/medaris-nazims/${sub}`, {
        decisions,
      });
      said.push("dismissed=1");
    }
  } catch (e) {
    failed.push(e.message);
  }
  if (deck) {
    try {
      said.push(`decks=${await unqueueDeck(account, deck)}`);
    } catch (e) {
      failed.push(e.message);
    }
  }
  if (failed.length)
    throw new Fail(`down ${accountKey(account)}: ${failed.join("; ")}`);
  console.log(`down ${accountKey(account)} ${said.join(" ")}`);
}

run("nazim", async () => {
  const [command, ...args] = process.argv.slice(2);
  const { rest, codes, code, deck } = options(args, {
    values: ["codes", "code", "deck"],
  });
  const [account, extra] = rest;
  if (!command || !account)
    throw new Fail(
      "usage: nazim.mjs up|drop|lacks|down <ACCOUNT> [options]",
      2
    );
  if (accountKey(account) === "MEDARIS_NAZIM")
    throw new Fail(
      "the seed's own Medaris nazımı is never changed by a walk",
      2
    );
  if (command === "up") await up(account, { codes, deck });
  else if (command === "drop") await drop(account, { code });
  else if (command === "lacks") await lacks(account, extra);
  else if (command === "down") await down(account, { deck });
  else throw new Fail(`unknown command ${command}`, 2);
});
