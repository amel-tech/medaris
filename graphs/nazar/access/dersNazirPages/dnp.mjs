// What nazar.access.dersNazirPages's walks need that graphs/bindings/helpers does not give: one call to tedrisat that is MEANT to be
// refused, with the status and the code it answers printed on one line. It is the binding's `effects`:
// `node ../nazar/access/dersNazirPages/dnp.mjs try ...` from graphs/bindings/. (Dismissing every ders nazırı post of the walk's own
// course is helpers/course-nazir-grants.mjs --course <id> --dismiss.)
//
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

const usage = "usage: dnp.mjs try <ACCOUNT> <METHOD> <path> [json-body]";

async function posts(courseId) {
  const r = await call("SYSTEM_ADMIN", "GET", `/courses/${courseId}/nazirs`);
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300)
    throw new Fail(`GET /courses/${courseId}/nazirs: ${refusal(r)}`);
  return r.body.items ?? [];
}

run("dnp", async () => {
  const [verb, ...args] = process.argv.slice(2);
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
