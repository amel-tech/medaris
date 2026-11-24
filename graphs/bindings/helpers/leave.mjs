// An account leaves a course, or takes its waiting application back: DELETE /courses/{id}/enrollment as that account.
// A person with no row is already where this goes, so it is not a failure.
//
//   node helpers/leave.mjs <ACCOUNT> <courseId>
//
// Prints `leave <ACCOUNT> <courseId> done` or `... none` (there was no row).
import { accountKey, call, Fail, refusal, run } from "./lib.mjs";

run("leave", async () => {
  const [account, course, ...more] = process.argv.slice(2);
  if (!account || !course || more.length)
    throw new Fail("usage: leave.mjs <ACCOUNT> <courseId>", 2);
  const r = await call(account, "DELETE", `/courses/${course}/enrollment`);
  if (r.status === 404 && r.body?.code === "ENROLLMENT_NOT_FOUND")
    return console.log(`leave ${accountKey(account)} ${course} none`);
  if (r.status < 200 || r.status >= 300)
    throw new Fail(`${accountKey(account)} left nothing: ${refusal(r)}`);
  console.log(`leave ${accountKey(account)} ${course} done`);
});
