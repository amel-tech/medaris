// How binding.yaml makes a read fail on the local stack: it spends one person's request budget on one route, so tedrisat answers
// that person's next calls to that route with 429 for the rest of the window, and every other call, route and person is left
// alone. nazar-web takes any answer but 401 for a failed read, so the roles read (GET /me/assignments) or a page's own read
// (GET /madrasahs/<id>/appeals) then draws its retry face. It changes no row: the only thing it writes is a counter in tedrisat's
// memory (libs/common/src/throttler/user-throttler.interceptor.ts), which lifts by itself one window (60 s) after it is spent.
//
//   hold  <ACCOUNT> <path>   reads <path> as the account until the API answers 429; prints `held <path> 429 retry-after=<s>`
//   clear <ACCOUNT> <path>   waits until <path> answers something other than 429 for the account; prints `clear <path> <status>`
//
// Why it works (read from the code, never run when this was written): the per-user layer counts calls per person per route in
// `UserThrottlerInterceptor`, keyed by the token's `sub`, and refuses the call over the limit with 429 and blocks the key for
// `blockDuration`, which is the window. Nothing is counted while it is blocked, so `clear` does not lengthen it. The limit is
// what the stack runs with (API__THROTTLE_USER_LIMIT, raised for walks); `hold` reads it from the response headers
// (x-ratelimit-remaining-user) and spends exactly what is left, so it needs no number of its own. A refused or failing call is not
// counted (the guards answer before the interceptor), so `hold` fails with a message on a 4xx or 5xx other than 429.
//
// ACCOUNT is a role key of graphs/.local/accounts.env or the binding's name for it (basmuderris). Nothing secret is printed.
import {
  API,
  Fail,
  options,
  run,
  token,
} from "../../../bindings/helpers/lib.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One read of tedrisat as the bearer; the body is drained so that the socket is free. */
async function read(bearer, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${bearer}`, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  await res.arrayBuffer();
  return res;
}

const retryAfter = (res) =>
  Number(res.headers.get("retry-after") ?? res.headers.get("retry-after-user"));

async function hold(account, path) {
  const bearer = await token(account);
  const first = await read(bearer, path);
  const said = (res) =>
    console.log(
      `held ${path} 429 retry-after=${Number.isFinite(retryAfter(res)) ? retryAfter(res) : "?"}`
    );
  if (first.status === 429) return said(first);
  if (first.status < 200 || first.status >= 300)
    throw new Fail(
      `${account} GET ${path} answers ${first.status}: a refused or failing call is not counted, so its budget cannot be spent`
    );
  const left = Number(first.headers.get("x-ratelimit-remaining-user"));
  const cap = (Number.isFinite(left) ? left : 3000) + 50;
  let sent = 0;
  let blocked;
  while (!blocked && sent < cap) {
    const n = Math.min(25, cap - sent);
    const answers = await Promise.all(
      Array.from({ length: n }, () => read(bearer, path))
    );
    sent += n;
    const bad = answers.find((a) => a.status >= 500);
    if (bad) throw new Fail(`${account} GET ${path} answers ${bad.status}`);
    blocked = answers.find((a) => a.status === 429);
  }
  if (!blocked)
    throw new Fail(
      `${account} GET ${path}: no 429 after ${sent + 1} calls (the headers said ${Number.isFinite(left) ? left : "nothing"} were left)`
    );
  const again = await read(bearer, path);
  if (again.status !== 429)
    throw new Fail(
      `${account} GET ${path}: the budget was spent but the next call answers ${again.status}`
    );
  said(again);
}

async function clear(account, path) {
  const bearer = await token(account);
  const until = Date.now() + 120_000;
  for (;;) {
    const res = await read(bearer, path);
    if (res.status !== 429) return console.log(`clear ${path} ${res.status}`);
    if (Date.now() > until)
      throw new Fail(`${account} GET ${path} is still refused after 120 s`);
    const wait = retryAfter(res);
    await sleep(
      Math.min(Number.isFinite(wait) && wait > 0 ? wait : 2, 10) * 1000
    );
  }
}

run("throttle", async () => {
  const { rest } = options(process.argv.slice(2));
  const [verb, account, path] = rest;
  if (
    !/^(hold|clear)$/.test(verb ?? "") ||
    !account ||
    !path ||
    rest.length !== 3
  )
    throw new Fail("usage: throttle.mjs hold|clear <ACCOUNT> <path>", 2);
  if (!path.startsWith("/"))
    throw new Fail(`the path must start with /, not ${path}`, 2);
  if (verb === "hold") await hold(account, path);
  else await clear(account, path);
});
