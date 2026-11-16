// A notification for a person. tedrisat has no route that writes one: a notification is the side effect of what somebody else does
// (NotificationService.notify, called by the producers). So the two it can be made through, by its API, are the course team's
// answer to an application; any other kind is a row written with SQL.
//
//   node helpers/notify.mjs <ACCOUNT> approved --course <id> [--as <ACCOUNT>]
//   node helpers/notify.mjs <ACCOUNT> rejected --course <id> [--reason <text>] [--as <ACCOUNT>]
//   node helpers/notify.mjs <ACCOUNT> raw <TYPE> [--target-type COURSE|SESSION|DECK|KOSK --target-id <uuid>] [--params <json>] [--read]
//   node helpers/notify.mjs <ACCOUNT> clear
//
//   approved   ENROLLMENT_APPROVED. The account applies if it has no application (a course that asks for approval, so the application
//              waits), then the course's müderris (or --as) approves it. The account ends ENROLLED: leave.mjs undoes the seat.
//   rejected   ENROLLMENT_REJECTED, with the reason. The same, but the application is refused and its row is gone.
//   raw        any NOTIFICATION_TYPES value, as a row of the notifications table (the API cannot make REMOVED_FROM_COURSE, SESSION_CANCELLED
//              and the others without taking something from the seed); --read makes it already read. Prints the new id.
//   clear      deletes every notification of the account, the seeded ones included. Use it on APPLICANT_A or APPLICANT_B, who start with none.
//
// Prints `notify <ACCOUNT> <kind> ...`.
import { query } from "./db.mjs";
import { accountKey, Fail, must, options, run, seatOf, subOf } from "./lib.mjs";

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

run("notify", async () => {
  const [account, kind, ...args] = process.argv.slice(2);
  const usage =
    "usage: notify.mjs <ACCOUNT> approved|rejected --course <id> [--reason <text>] [--as <ACCOUNT>] | raw <TYPE> [--target-type T --target-id <uuid>] [--params <json>] [--read] | clear";
  if (!account || !kind) throw new Fail(usage, 2);
  const key = accountKey(account);
  const userId = subOf(account);

  if (kind === "approved" || kind === "rejected") {
    const o = options(args, { values: ["course", "reason", "as"] });
    if (!o.course || o.rest.length) throw new Fail(usage, 2);
    const team = o.as ?? "MUDERRIS";
    // look before applying: on a course that takes anyone the application would be a seat, which this would leave behind
    const course = (await must(account, "GET", `/courses/${o.course}`)).body;
    if (!course.requiresApproval)
      throw new Fail(
        `${course.title} takes anyone: an application there is a seat at once, with nothing to answer`
      );
    let seat = await seatOf(account, o.course);
    if (seat === "none") {
      await must(account, "POST", `/courses/${o.course}/enroll`);
      seat = await seatOf(account, o.course);
    }
    if (seat !== "PENDING")
      throw new Fail(
        `${key} is ${seat} in ${o.course}, not waiting: only a course that asks for approval has an application to answer`
      );
    if (kind === "approved")
      await must(
        team,
        "POST",
        `/courses/${o.course}/enrollments/${userId}/approve`
      );
    else
      await must(
        team,
        "DELETE",
        `/courses/${o.course}/enrollments/${userId}`,
        o.reason ? { reason: o.reason } : undefined
      );
    console.log(
      `notify ${key} ${kind} ${o.course} ${kind === "approved" ? "ENROLLMENT_APPROVED" : "ENROLLMENT_REJECTED"}`
    );
  } else if (kind === "raw") {
    const o = options(args, {
      values: ["target-type", "target-id", "params"],
      flags: ["read"],
    });
    const [type, ...extra] = o.rest;
    if (!type || extra.length || !/^[A-Z][A-Z_]+$/.test(type))
      throw new Fail(usage, 2);
    const targetType = o["target-type"];
    const targetId = o["target-id"];
    if ((targetType === undefined) !== (targetId === undefined))
      throw new Fail("--target-type and --target-id go together", 2);
    if (
      targetType !== undefined &&
      !/^(COURSE|SESSION|DECK|KOSK)$/.test(targetType)
    )
      throw new Fail("--target-type is COURSE, SESSION, DECK or KOSK", 2);
    if (targetId !== undefined && !UUID.test(targetId))
      throw new Fail("--target-id is not a uuid", 2);
    let params = {};
    if (o.params !== undefined) {
      try {
        params = JSON.parse(o.params);
      } catch (e) {
        throw new Fail(`--params is not JSON: ${e.message}`, 2);
      }
      if (
        params === null ||
        typeof params !== "object" ||
        Array.isArray(params)
      )
        throw new Fail("--params is a JSON object", 2);
    }
    const out = await query(
      `insert into notifications (user_id, type, target_type, target_id, params, read_at) values (${lit(userId)}, ${lit(type)}, ${targetType ? lit(targetType) : "null"}, ${targetId ? lit(targetId) : "null"}, ${lit(JSON.stringify(params))}::jsonb, ${o.read ? "now()" : "null"}) returning id`
    );
    console.log(
      `notify ${key} raw ${type} ${JSON.parse(out.trim().split("\n")[0]).id}`
    );
  } else if (kind === "clear") {
    if (args.length) throw new Fail(usage, 2);
    const out = await query(
      `delete from notifications where user_id = ${lit(userId)}`
    );
    console.log(
      `notify ${key} clear ${JSON.parse(out.trim().split("\n")[0]).rows}`
    );
  } else {
    throw new Fail(usage, 2);
  }
});
