// The way back of this flow's `barred` scenario: lifts every open ban of an account in the medrese, as the başmüderris who
// placed it (POST /bans/:id/lift), through tedrisat's HTTP API. The ban itself is made by helpers/api.mjs in the scenario's setup
// (POST /madrasahs/:id/bans); lifting needs the ban's id, which only the list has, so it is a command of its own.
//
//   node ../nazar/nazirs/appoint/unbar.mjs <ACCOUNT> --madrasah <id>
//
// Prints `unbarred <ACCOUNT> <n>`, n being the bans it lifted (0 is fine: nothing was open). A lifted ban stays in the medrese's
// list as history ("Kaldırılmış"): no route deletes it. Nothing secret is printed.
import {
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

run("unbar", async () => {
  const { rest, madrasah } = options(process.argv.slice(2), {
    values: ["madrasah"],
  });
  const [account, ...more] = rest;
  if (!account || !madrasah || more.length)
    throw new Fail("usage: unbar.mjs <ACCOUNT> --madrasah <id>", 2);
  const userId = subOf(account).toLowerCase();
  const list = await must(
    "basmuderris",
    "GET",
    `/madrasahs/${madrasah}/bans?status=ACTIVE`
  );
  const open = (list.body?.items ?? []).filter(
    (ban) => ban.user?.id?.toLowerCase() === userId
  );
  for (const ban of open)
    await must("basmuderris", "POST", `/bans/${ban.id}/lift`, {
      reason: "Deneme bitti.",
    });
  console.log(`unbarred ${account} ${open.length}`);
});
