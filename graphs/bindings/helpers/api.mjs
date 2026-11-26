// One call to tedrisat (http://localhost:3001, or $TEDRISAT_URL) as one of the stack's accounts.
//
//   node helpers/api.mjs <ACCOUNT> <METHOD> <path> [json-body | @file] [--any]
//
// ACCOUNT is the role key of graphs/.local/accounts.env (TALEBE_MALE) or the binding's name for it (talebeMale). The
// body is a JSON text, or `@path` to read it from a file (relative to the working directory, graphs/bindings/).
// On a 2xx answer it prints the answer's JSON on one line to stdout and exits 0, so a binding's `expect` can match it.
// On any other answer it prints `HTTP <status> <code>: <message>` to stderr and exits 1, which fails the step; with --any
// it exits 0 whatever the status and prints `HTTP <status> <body>` to stdout, for a step that expects a refusal.
import { readFileSync } from "node:fs";
import { call, Fail, options, refusal, run } from "./lib.mjs";

run("api", async () => {
  const { rest, any } = options(process.argv.slice(2), { flags: ["any"] });
  const [account, method, path, raw] = rest;
  if (!account || !method || !path || rest.length > 4)
    throw new Fail(
      "usage: api.mjs <ACCOUNT> <METHOD> <path> [json-body | @file] [--any]",
      2
    );
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/i.test(method))
    throw new Fail(`${method} is not a method of tedrisat`, 2);
  let body;
  if (raw !== undefined) {
    const text = raw.startsWith("@") ? readFileSync(raw.slice(1), "utf8") : raw;
    try {
      body = JSON.stringify(JSON.parse(text));
    } catch (e) {
      throw new Fail(`the body is not JSON: ${e.message}`, 2);
    }
  }
  const r = await call(account, method, path, body);
  const shown = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  const ok = r.status >= 200 && r.status < 300;
  if (any) {
    console.log(`HTTP ${r.status} ${shown ?? ""}`.trimEnd());
  } else if (ok) {
    console.log(shown || `HTTP ${r.status}`);
  } else {
    if (shown) console.log(shown);
    throw new Fail(refusal(r));
  }
});
