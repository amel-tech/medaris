// What a course holds for an account, for an `effects` check: GET /courses/enrolled?includePending=true as that account.
//
//   node helpers/seat.mjs <ACCOUNT> <courseId>
//
// Prints `seat <ACCOUNT> <courseId> ENROLLED|PENDING|COMPLETED|...|none`.
import { accountKey, Fail, run, seatOf } from "./lib.mjs";

run("seat", async () => {
  const [account, course, ...more] = process.argv.slice(2);
  if (!account || !course || more.length)
    throw new Fail("usage: seat.mjs <ACCOUNT> <courseId>", 2);
  console.log(
    `seat ${accountKey(account)} ${course} ${await seatOf(account, course)}`
  );
});
