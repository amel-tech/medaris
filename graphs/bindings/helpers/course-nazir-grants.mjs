// Sets the permissions of a ders nazırı's post in a course, the way the hoca does on the course's Nazırlar page:
// PATCH /courses/{id}/nazirs/{postId} with the whole set and no end date, as the course's müderris. A person who holds no post
// in the course yet is appointed with POST /courses/{id}/nazirs.
//
//   node helpers/course-nazir-grants.mjs --course <id> --nazir <ACCOUNT> --codes <code,code,...|none|seed> [--as <ACCOUNT>]
//
//   --codes none    the post with no permission at all
//   --codes seed    what the stack's seed gave the ders nazırı: enrollment.decide, course.view_unpublished, session.manage
//   --as            who sets them (default MUDERRIS, the müderris of every seeded course)
//
// Prints `course-nazir-grants <ACCOUNT> <courseId> <the codes now held, in the API's order>`.
//
//   node helpers/course-nazir-grants.mjs --course <id> --dismiss
//
//   --dismiss       the way back: dismisses every ders nazırı post of the course (DELETE /courses/{id}/nazirs/{postId}) as the başnazım,
//                   the people a post appointed first: a post whose holder still has appointees is refused with 409
//                   DISMISS_SEAT_HANDED_ON until they are gone, so it goes round again, four times at most. Prints
//                   `course-nazir-grants dismiss <id>: <n> dismissed, <m> left`; a course that is not there (404) is `none`.
import {
  accountKey,
  call,
  Fail,
  must,
  options,
  refusal,
  run,
  subOf,
} from "./lib.mjs";

const SEED = ["enrollment.decide", "course.view_unpublished", "session.manage"];

// the posts of a course as the başnazım reads them, or null when the course is not there
async function posts(courseId) {
  const r = await call("SYSTEM_ADMIN", "GET", `/courses/${courseId}/nazirs`);
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300)
    throw new Fail(`GET /courses/${courseId}/nazirs: ${refusal(r)}`);
  return r.body.items ?? [];
}

async function dismiss(courseId) {
  let left = await posts(courseId);
  if (left === null) {
    console.log(`course-nazir-grants dismiss ${courseId}: none`);
    return;
  }
  let dismissed = 0;
  for (let pass = 0; pass < 4 && left.length > 0; pass++) {
    for (const post of left) {
      const r = await call(
        "SYSTEM_ADMIN",
        "DELETE",
        `/courses/${courseId}/nazirs/${post.id}`
      );
      if (r.status >= 200 && r.status < 300) dismissed++;
      else if (r.status !== 404 && r.status !== 409)
        throw new Fail(`DELETE nazirs/${post.id}: ${refusal(r)}`);
    }
    left = (await posts(courseId)) ?? [];
  }
  console.log(
    `course-nazir-grants dismiss ${courseId}: ${dismissed} dismissed, ${left.length} left`
  );
}

run("course-nazir-grants", async () => {
  const o = options(process.argv.slice(2), {
    values: ["course", "nazir", "codes", "as"],
    flags: ["dismiss"],
  });
  if (o.dismiss === true) {
    if (!o.course || o.nazir || o.codes !== undefined || o.as || o.rest.length)
      throw new Fail(
        "usage: course-nazir-grants.mjs --course <id> --dismiss",
        2
      );
    return dismiss(o.course);
  }
  if (!o.course || !o.nazir || o.codes === undefined || o.rest.length)
    throw new Fail(
      "usage: course-nazir-grants.mjs --course <id> --nazir <ACCOUNT> --codes <code,code,...|none|seed> [--as <ACCOUNT>]",
      2
    );
  const giver = o.as ?? "MUDERRIS";
  const permissions =
    o.codes === "none"
      ? []
      : o.codes === "seed"
        ? SEED
        : o.codes
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
  if (o.codes !== "none" && !permissions.length)
    throw new Fail("--codes is empty: say none for no permission", 2);
  const userId = subOf(o.nazir);
  const list = (await must(giver, "GET", `/courses/${o.course}/nazirs`)).body;
  const post = (list.items ?? []).find((p) => p.user?.id === userId);
  const r = post
    ? await must(giver, "PATCH", `/courses/${o.course}/nazirs/${post.id}`, {
        permissions,
        endsAt: null,
      })
    : await must(giver, "POST", `/courses/${o.course}/nazirs`, {
        userId,
        permissions,
      });
  const now = (r.body.items ?? []).find((p) => p.user?.id === userId);
  console.log(
    `course-nazir-grants ${accountKey(o.nazir)} ${o.course} ${now?.permissions?.length ? now.permissions.join(",") : "none"}`
  );
});
