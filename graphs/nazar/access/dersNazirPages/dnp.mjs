// The two things nazar.access.dersNazirPages's walks need that graphs/bindings/helpers does not give: dismissing every ders nazırı post of the
// walk's own course, and one call to tedrisat that is MEANT to be refused, with the status and the code it answers printed on one line. It is
// the binding's `teardown` and `effects`: `node ../nazar/access/dersNazirPages/dnp.mjs <verb> ...` from graphs/bindings/.
//
//   clear <courseId>
//        Dismisses every ders nazırı post of the course (DELETE /courses/:id/nazirs/:postId) as the başnazım, the people a post appointed
//        first: a post whose holder still has appointees is refused with 409 DISMISS_SEAT_HANDED_ON until they are gone, so it goes round
//        again, four times at most. Prints `dnp clear <id>: <n> dismissed, <m> left`; a course that is not there (404) is `none`.
//   try <ACCOUNT> <METHOD> <path> [json-body]
//        One call as ACCOUNT, whatever it answers: prints `dnp try <METHOD> <path>: <status> <code>` (`ok` for a 2xx, no code), exit 0. In
//        the path, `@post:<ACCOUNT2>` stands for the id of ACCOUNT2's ders nazırı post in that course (read as the başnazım), so a call
//        that names a post can be written before the walk knows its id: `/courses/<id>/nazirs/@post:applicantD`.
//
// Only the API is used. Nothing secret is printed. Run it under the replay lock when walks are running and you run it by hand.
import {
  accountKey,
  call,
  Fail,
  refusal,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const usage =
  "usage: dnp.mjs clear <courseId> | try <ACCOUNT> <METHOD> <path> [json-body]";

async function posts(courseId) {
  const r = await call("SYSTEM_ADMIN", "GET", `/courses/${courseId}/nazirs`);
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300)
    throw new Fail(`GET /courses/${courseId}/nazirs: ${refusal(r)}`);
  return r.body.items ?? [];
}

run("dnp", async () => {
  const [verb, ...args] = process.argv.slice(2);
  if (verb === "clear") {
    const [courseId, ...more] = args;
    if (!courseId || more.length) throw new Fail(usage, 2);
    let left = await posts(courseId);
    if (left === null) {
      console.log(`dnp clear ${courseId}: none`);
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
      `dnp clear ${courseId}: ${dismissed} dismissed, ${left.length} left`
    );
    return;
  }
  if (verb === "try") {
    const [account, method, rawPath, rawBody, ...more] = args;
    if (!account || !method || !rawPath || more.length)
      throw new Fail(usage, 2);
    let path = rawPath;
    const at = /@post:([A-Za-z0-9_-]+)/.exec(path);
    if (at) {
      const course = /^\/courses\/([0-9a-f-]{36})\//.exec(path)?.[1];
      if (!course)
        throw new Fail("@post:<ACCOUNT> needs a path under /courses/<id>/", 2);
      const who = subOf(at[1]).toLowerCase();
      const post = (await posts(course))?.find(
        (p) => p.user?.id?.toLowerCase() === who
      );
      if (!post)
        throw new Fail(`${accountKey(at[1])} holds no post in ${course}`);
      path = path.replace(at[0], post.id);
    }
    const r = await call(
      account,
      method,
      path,
      rawBody === undefined ? undefined : JSON.stringify(JSON.parse(rawBody))
    );
    const code =
      r.body && typeof r.body === "object" ? (r.body.code ?? "") : "";
    const ok = r.status >= 200 && r.status < 300;
    console.log(
      `dnp try ${method.toUpperCase()} ${rawPath}: ${r.status} ${ok ? "ok" : code}`.trimEnd()
    );
    return;
  }
  throw new Fail(usage, 2);
});
