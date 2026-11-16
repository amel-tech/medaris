#!/usr/bin/env node
// The walk data of nizam.nazims.dismiss that no shared helper makes: what a Medaris nazımı has handed on, and a read of what the
// dismissal left. It is the binding's `setup`, `events` and `effects` (`node ../nizam/nazims/dismiss/dismiss.mjs ...`; the working
// directory is graphs/bindings/). Everything goes through tedrisat's HTTP API as the person who may; no SQL.
//
//   hand  --nazim ACC --kosk <handle> --to ACC[,ACC] [--name <text>]
//       the Medaris nazımı ACC opens a köşk and names the `--to` accounts its nazımları (POST /kosks, which a Medaris nazımı holding
//       platform.kosk_create may call: kosk.controller.ts:309). Each nazım row is a KOSK_NAZIM role given by ACC, which is what the
//       dismissal dialog lists, one row a person. A köşk with that short name left by an earlier walk is removed first, so every start
//       is the same. ACC must already be a Medaris nazımı holding platform.kosk_create (../../home/medarisNazimCut/nazim.mjs up).
//   state --nazim ACC [--kosk <handle> --who ACC[,ACC]]
//       read as the başnazım, for an `effects` check. Prints `nazim <KEY> held|none` and, per --who account,
//       `kosk-nazim <KEY> held, given by <KEY|ROLE>` or `kosk-nazim <KEY> none` (`kosk <handle> none` when the köşk is gone).
//
// <ACC> is the role key of graphs/.local/accounts.env (APPLICANT_C) or the binding's name for it (applicantC). Only spare talebe accounts
// are ever used here, never the seed's own Medaris nazımı (its row is not this flow's to change): both commands refuse it. Removing the
// köşk afterwards is helpers/remove-kosk.mjs; dismissing the Medaris nazımı is ../../home/medarisNazimCut/nazim.mjs down. Nothing
// secret is printed: no password, no token.
import {
  accountKey,
  env,
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const CHIEF = "SYSTEM_ADMIN";

const keyOfSub = (sub) => {
  const hit = Object.keys(env())
    .map((k) => /^E2E_(.+)_SUB$/.exec(k)?.[1])
    .filter((k) => k !== "SISTEM_ADMIN") // the same person under the spelling nazar's accounts.ts documents
    .find(
      (k) =>
        k && env()[`E2E_${k}_SUB`]?.toLowerCase() === String(sub).toLowerCase()
    );
  return hit ?? "someone";
};

/** Every köşk of that short name, as the başnazım sees the directory. */
async function kosksOf(handle) {
  const found = (
    await must(
      CHIEF,
      "GET",
      `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  return (found.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === handle
  );
}

async function hand(account, { kosk, to, name }) {
  if (!kosk || !to)
    throw new Fail("hand needs --kosk <handle> and --to ACC[,ACC]", 2);
  const handle = kosk.replace(/^@/, "").toLowerCase();
  const people = to
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const ids = [];
  for (const p of people) {
    await must(p, "GET", "/me"); // tedrisat makes the person's row at their first call; the köşk names it
    ids.push(subOf(p));
  }
  for (const k of await kosksOf(handle))
    await must(CHIEF, "DELETE", `/kosks/${k.id}`);
  const made = (
    await must(account, "POST", "/kosks", {
      name: name ?? `Deneme köşkü ${handle}`,
      handle,
      managerUserIds: ids,
    })
  ).body;
  console.log(
    `handed ${accountKey(account)} kosk=${handle} id=${made?.id ?? "?"} to=${people.map(accountKey).join(",")}`
  );
}

async function state(account, { kosk, who }) {
  const sub = subOf(account);
  const rows = (await must(CHIEF, "GET", "/nizam/medaris-nazims")).body ?? [];
  const lines = [
    `nazim ${accountKey(account)} ${rows.some((r) => r.user?.id?.toLowerCase() === sub.toLowerCase()) ? "held" : "none"}`,
  ];
  if (kosk) {
    const handle = kosk.replace(/^@/, "").toLowerCase();
    const found = await kosksOf(handle);
    if (found.length === 0) lines.push(`kosk ${handle} none`);
    for (const k of found) {
      const nazims =
        (await must(CHIEF, "GET", `/kosks/${k.id}/nazims`)).body ?? [];
      for (const person of (who ?? "").split(",").filter(Boolean)) {
        const row = nazims.find(
          (n) => n.user?.id?.toLowerCase() === subOf(person).toLowerCase()
        );
        lines.push(
          row
            ? `kosk-nazim ${accountKey(person)} held, given by ${keyOfSub(row.grantedBy?.id)}`
            : `kosk-nazim ${accountKey(person)} none`
        );
      }
    }
  }
  console.log(lines.join("; "));
}

run("dismiss", async () => {
  const [command, ...args] = process.argv.slice(2);
  const { rest, nazim, kosk, to, who, name } = options(args, {
    values: ["nazim", "kosk", "to", "who", "name"],
  });
  if (!command || !nazim || rest.length)
    throw new Fail(
      "usage: dismiss.mjs hand|state --nazim ACC [options]; see the header of the file",
      2
    );
  if (accountKey(nazim) === "MEDARIS_NAZIM")
    throw new Fail(
      "the seed's own Medaris nazımı is never changed by a walk",
      2
    );
  if (command === "hand") await hand(nazim, { kosk, to, name });
  else if (command === "state") await state(nazim, { kosk, who });
  else throw new Fail(`unknown command ${command}`, 2);
});
