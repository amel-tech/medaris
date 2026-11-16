// The one command the walks of nazar.courseNazirs.dismiss need that no shared helper has: dismiss a spare account's ders nazırı post in a course as the
// hoca does on the page (DELETE /courses/:id/nazirs/:postId), to make the world move while the page is stale (the event ELSEWHERE_DISMISSES).
// It is the binding's `events`: `node ../nazar/courseNazirs/dismiss/nazirs.mjs revoke ...` (the working directory is graphs/bindings/).
//
//   revoke --course <id> --nazir <ACCOUNT> [--as <ACCOUNT>]
//
//   --nazir  the spare talebe account whose post is dismissed (applicantF); a seeded account is never named here
//   --as     who dismisses (default MUDERRIS, the müderris of the walk's course)
//
// Prints `nazirs revoke <ACCOUNT> revoked`, or `nazirs revoke <ACCOUNT> none` when the account holds no post in the course (not a failure). The post
// is found in the list the hoca reads (GET /courses/:id/nazirs), so a person who appointed others is refused with 409 DISMISS_SEAT_HANDED_ON, as the
// page's own button would be. Nothing secret is printed: no password, no token.
import {
  accountKey,
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const usage =
  "usage: nazirs.mjs revoke --course <id> --nazir <ACCOUNT> [--as <ACCOUNT>]";

run("nazirs", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb !== "revoke") throw new Fail(usage, 2);
  const o = options(rest, { values: ["course", "nazir", "as"] });
  if (!o.course || !o.nazir || o.rest.length) throw new Fail(usage, 2);
  const giver = o.as ?? "MUDERRIS";
  const userId = subOf(o.nazir);
  const list = (await must(giver, "GET", `/courses/${o.course}/nazirs`)).body;
  const post = (list.items ?? []).find((p) => p.user?.id === userId);
  if (!post) {
    console.log(`nazirs revoke ${accountKey(o.nazir)} none`);
    return;
  }
  await must(giver, "DELETE", `/courses/${o.course}/nazirs/${post.id}`);
  console.log(`nazirs revoke ${accountKey(o.nazir)} revoked`);
});
