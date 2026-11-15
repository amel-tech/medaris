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
import { accountKey, Fail, must, options, run, subOf } from "./lib.mjs";

const SEED = ["enrollment.decide", "course.view_unpublished", "session.manage"];

run("course-nazir-grants", async () => {
  const o = options(process.argv.slice(2), {
    values: ["course", "nazir", "codes", "as"],
  });
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
