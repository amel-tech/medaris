// The walk data of nazar.roster.bulkAdd that helpers/course.mjs and helpers/api.mjs do not give: what a list of talebe left in the course,
// read as each of them, and a list of more than 500 addresses to paste. It is the binding's `setup` and `effects`.
//
//   node ../nazar/roster/bulkAdd/bulk.mjs seats --course <id> KEY=STATUS[,KEY=STATUS...]
//   node ../nazar/roster/bulkAdd/bulk.mjs many
//
// seats  Reads each account's seat in the course as that account does (GET /courses/enrolled?includePending=true, the way
//        helpers/seat.mjs does) and fails, naming the account, unless it is what the list says; STATUS is ENROLLED, PENDING, COMPLETED
//        or `none` (no row). Prints `seats ok` and, on one line, what it read. Read only.
// many   Writes graphs/.local/made/bulkadd-many.json, `{"list": "<501 distinct addresses, one a line>"}`, for the walk that pastes more
//        than the 500 the dialog takes (a binding reads it as the data source `many`). It writes no data on the stack. Prints `many 501`.
//
// KEY is an account of graphs/.local/accounts.env (a spare talebe, APPLICANT_H). Nothing secret is printed: no address, no token.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  Fail,
  LOCAL,
  options,
  run,
  seatOf,
} from "../../../bindings/helpers/lib.mjs";

const usage =
  "usage: bulk.mjs seats --course <id> KEY=STATUS[,KEY=STATUS...] | many";

run("bulk", async () => {
  const [verb, ...args] = process.argv.slice(2);
  if (verb === "seats") {
    const o = options(args, { values: ["course"] });
    if (!o.course || o.rest.length !== 1) throw new Fail(usage, 2);
    const read = [];
    for (const pair of o.rest[0].split(",").filter(Boolean)) {
      const [who, want] = pair.split("=");
      if (!who || !want) throw new Fail(`${pair} is not KEY=STATUS`, 2);
      const key = accountKey(who);
      const seat = await seatOf(key, o.course);
      read.push(`${key}=${seat}`);
      if (seat !== want)
        throw new Fail(`${key} holds ${seat} in the course, not ${want}`);
    }
    console.log(`seats ok ${read.join(" ")}`);
  } else if (verb === "many") {
    if (args.length) throw new Fail(usage, 2);
    const list = Array.from(
      { length: 501 },
      (_, i) => `kisi${String(i).padStart(3, "0")}@example.test`
    ).join("\n");
    const dir = resolve(LOCAL, "made");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(
      resolve(dir, "bulkadd-many.json"),
      `${JSON.stringify({ list })}\n`,
      { mode: 0o600 }
    );
    console.log("many 501");
  } else throw new Fail(usage, 2);
});
