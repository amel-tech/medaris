// Takes an account out of a course's müderrisler (the way back from seat-hoca.mjs). The last müderris cannot be taken out;
// if the account is the imam, the first of the others becomes the imam. Taking out someone who is not seated changes nothing.
//
//   node helpers/unseat-hoca.mjs <courseId> <ACCOUNT>
//
// Prints `unseat-hoca <ACCOUNT> <courseId> done|already`.
import { accountKey, Fail, reseatMuderris, run, subOf } from "./lib.mjs";

run("unseat-hoca", async () => {
  const [course, account, ...more] = process.argv.slice(2);
  if (!course || !account || more.length)
    throw new Fail("usage: unseat-hoca.mjs <courseId> <ACCOUNT>", 2);
  const userId = subOf(account);
  const changed = await reseatMuderris(course, (team, imam) => {
    if (!team.some((m) => m.userId === userId)) return null;
    const left = team.filter((m) => m.userId !== userId);
    if (!left.length)
      throw new Fail(
        `${accountKey(account)} is the only müderris of ${course}: the last one cannot be taken out`
      );
    return { team: left, imam: imam === userId ? left[0].userId : imam };
  });
  console.log(
    `unseat-hoca ${accountKey(account)} ${course} ${changed ? "done" : "already"}`
  );
});
