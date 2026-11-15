// Makes an account a müderris ("hoca") of a course, beside the ones it has: the başnazım saves the new list through the
// medrese's route, or the köşk's own for a köşk course. The imam stays who it was. Seating someone already seated changes nothing.
//
//   node helpers/seat-hoca.mjs <courseId> <ACCOUNT>
//
// Prints `seat-hoca <ACCOUNT> <courseId> done|already`. To undo it: unseat-hoca.mjs.
import {
  accountKey,
  Fail,
  nameOf,
  reseatMuderris,
  run,
  subOf,
} from "./lib.mjs";

run("seat-hoca", async () => {
  const [course, account, ...more] = process.argv.slice(2);
  if (!course || !account || more.length)
    throw new Fail("usage: seat-hoca.mjs <courseId> <ACCOUNT>", 2);
  const userId = subOf(account);
  const changed = await reseatMuderris(course, async (team, imam) =>
    team.some((m) => m.userId === userId)
      ? null
      : { team: [...team, { userId, name: await nameOf(account) }], imam }
  );
  console.log(
    `seat-hoca ${accountKey(account)} ${course} ${changed ? "done" : "already"}`
  );
});
