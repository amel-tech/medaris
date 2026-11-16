// What Keycloak remembers of a person's consent to a partner client, for the walks of realm.auth.partnerConsent. Run from
// graphs/bindings/ the way a binding runs a helper:
//
//   node ../realm/auth/partnerConsent/consent.mjs status <ACCOUNT> <clientId> [--until granted|none] [--wait <s>]
//   node ../realm/auth/partnerConsent/consent.mjs forget <ACCOUNT> <clientId>
//   node ../realm/auth/partnerConsent/consent.mjs grant  <ACCOUNT> <clientId> [--redirect <uri>]
//
// Keycloak keeps a person's "İzin ver" and never shows the page again for the same scopes, so a walk of the page must
// start with no consent (forget) and a walk of the remembered case with one (grant).
//   status   prints `consent <ACCOUNT> <clientId> granted|none`; with --until it polls (up to --wait seconds, 10 by default)
//            for that answer and fails when it does not come.
//   forget   takes the consent back as the person's own account console API does (DELETE <issuer>/account/applications/
//            <clientId>/consent with the person's own token, so no Keycloak admin credentials); `none` is not a failure.
//   grant    does what a person does: the authorization request of the client (the example partner's registered redirect
//            address, PKCE S256, scope `openid email full-name gender`), the realm's form, then "İzin ver". Nothing is
//            followed to the partner's address, which does not resolve here.
// ACCOUNT is the same role key or name the shared helpers take (graphs/bindings/helpers/README.md). No secret is printed.
import { setTimeout as sleep } from "node:timers/promises";
import {
  accountKey,
  env,
  Fail,
  options,
  run,
  token,
} from "../../../bindings/helpers/lib.mjs";

const issuer = () => env().E2E_KEYCLOAK_ISSUER.replace(/\/$/, "");
const ACCOUNT_API = () => `${issuer()}/account`;

async function row(account, clientId) {
  const res = await fetch(`${ACCOUNT_API()}/applications`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${await token(account)}`,
      accept: "application/json",
    },
  });
  if (!res.ok)
    throw new Fail(
      `GET /account/applications answered ${res.status}: the account's token cannot read its own applications`
    );
  return (await res.json()).find((a) => a.clientId === clientId);
}

const granted = async (account, clientId) =>
  ((await row(account, clientId))?.consent?.grantedScopes?.length ?? 0) > 0;

async function forget(account, clientId) {
  if (!(await granted(account, clientId))) return false;
  const res = await fetch(
    `${ACCOUNT_API()}/applications/${encodeURIComponent(clientId)}/consent`,
    {
      method: "DELETE",
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${await token(account)}`,
        accept: "application/json", // without it the endpoint answers 405
      },
    }
  );
  if (!res.ok && res.status !== 404)
    throw new Fail(`DELETE the consent of ${clientId} answered ${res.status}`);
  return true;
}

// one cookie jar for the whole authorization request: the form and its post belong to one authentication session
function remember(res, jar) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    jar.set(
      pair.slice(0, pair.indexOf("=")),
      pair.slice(pair.indexOf("=") + 1)
    );
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

// the theme draws its pages in the browser from window.kcContext, so what a page posts to is in the HTML as JSON
const fromContext = (html, key) => {
  const m = new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(html);
  return m ? JSON.parse(m[1]) : undefined;
};

async function grant(account, clientId, redirect) {
  const key = accountKey(account);
  const url = new URL(`${issuer()}/protocol/openid-connect/auth`);
  for (const [k, v] of Object.entries({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email full-name gender",
    state: "graphs",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", // RFC 7636 appendix B; the partner's side is never played
    code_challenge_method: "S256",
  }))
    url.searchParams.set(k, v);
  const jar = new Map();
  const hop = (u, init = {}) =>
    fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
      ...init,
      headers: {
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...init.headers,
      },
    }).then((r) => (remember(r, jar), r));
  const page = await hop(url);
  const loginAction = fromContext(await page.text(), "loginAction");
  if (!loginAction)
    throw new Fail(
      `${key}: the authorization request of ${clientId} gave no login form (status ${page.status})`
    );
  const post = await hop(loginAction, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: env()[`E2E_${key}_EMAIL`],
      password: env()[`E2E_${key}_PASSWORD`],
      credentialId: "",
    }),
  });
  const next = post.headers.get("location") ?? "";
  if (post.status !== 302 || !next.includes("OAUTH_GRANT"))
    throw new Fail(
      `${key}: after the password Keycloak did not ask for consent (status ${post.status}${next.startsWith(redirect) ? ", it went straight on: consent is there already" : ""})`
    );
  const consent = await (await hop(new URL(next, issuer()))).text();
  const action = fromContext(consent, "oauthAction");
  const code = /"oauth"\s*:\s*\{[^}]*?"code"\s*:\s*"([^"]+)"/.exec(
    consent
  )?.[1];
  if (!action || !code)
    throw new Fail(
      `${key}: the consent page of ${clientId} has no oauthAction or code`
    );
  const accept = await hop(new URL(action, issuer()), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, accept: "" }),
  });
  if (
    accept.status !== 302 ||
    !(accept.headers.get("location") ?? "").startsWith(redirect)
  )
    throw new Fail(
      `${key}: "İzin ver" was not answered with a redirect to ${redirect} (status ${accept.status})`
    );
}

run("consent", async () => {
  const { rest, until, wait, redirect } = options(process.argv.slice(2), {
    values: ["until", "wait", "redirect"],
  });
  const [verb, account, clientId, ...more] = rest;
  if (
    !/^(status|forget|grant)$/.test(verb ?? "") ||
    !account ||
    !clientId ||
    more.length
  )
    throw new Fail(
      "usage: consent.mjs status|forget|grant <ACCOUNT> <clientId> [--until granted|none] [--wait <s>] [--redirect <uri>]",
      2
    );
  const key = accountKey(account);
  if (verb === "forget") {
    console.log(
      `consent ${key} ${clientId} ${(await forget(account, clientId)) ? "forgotten" : "none"}`
    );
  } else if (verb === "grant") {
    if (!redirect && clientId !== "ornek-uygulama")
      throw new Fail(
        "--redirect <uri> is needed for a client other than ornek-uygulama",
        2
      );
    if (await granted(account, clientId)) {
      console.log(`consent ${key} ${clientId} granted`);
      return;
    }
    await grant(
      account,
      clientId,
      redirect ?? "https://ornek.example/auth/medaris/callback"
    );
    console.log(
      `consent ${key} ${clientId} ${(await granted(account, clientId)) ? "granted" : "none"}`
    );
  } else {
    if (until !== undefined && !/^(granted|none)$/.test(until))
      throw new Fail("--until is granted or none", 2);
    const deadline = Date.now() + Number(wait ?? 10) * 1000;
    for (;;) {
      const now = (await granted(account, clientId)) ? "granted" : "none";
      if (until === undefined || now === until) {
        console.log(`consent ${key} ${clientId} ${now}`);
        return;
      }
      if (Date.now() > deadline)
        throw new Fail(`consent ${key} ${clientId} is ${now}, not ${until}`);
      await sleep(500);
    }
  }
});
