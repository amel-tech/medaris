// An account applies to a course, as the person does with "Başvur" or "Kaydol": POST /courses/{id}/enroll as that account.
//
//   node helpers/apply.mjs <ACCOUNT> <courseId>
//
// A course that takes anyone gives the seat at once (ENROLLED); one that asks for approval leaves a waiting application
// (PENDING). Applying again changes nothing. Prints `apply <ACCOUNT> <courseId> <STATUS>`. To take the row away: leave.mjs.
import { accountKey, Fail, must, run } from "./lib.mjs";

run("apply", async () => {
  const [account, course, ...more] = process.argv.slice(2);
  if (!account || !course || more.length)
    throw new Fail("usage: apply.mjs <ACCOUNT> <courseId>", 2);
  const r = await must(account, "POST", `/courses/${course}/enroll`);
  console.log(
    `apply ${accountKey(account)} ${course} ${r.body?.status ?? "ok"}`
  );
});
