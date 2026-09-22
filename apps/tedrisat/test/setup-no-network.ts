/**
 * tedrisat — the suite may not leave this machine (MDRS-89).
 *
 * A `setupFiles` entry, so it runs inside every worker before that worker's
 * test file. It replaces `globalThis.fetch` with one that refuses any request
 * to a host that is not loopback.
 *
 * Why an enforced guard rather than a convention: the thing this replaces was
 * `KeycloakPublicKeyProvider.onModuleInit`, which catches its own failure and
 * logs `Failed to pre-load JWKS keys during module initialization`. A log line
 * is not a gate — it is why 21 outbound requests per run to production Keycloak
 * survived in this suite for months, and why the day the host became reachable
 * again the only visible symptom (that log line) disappeared while the requests
 * kept happening.
 *
 * **Throwing is not enough, for exactly that reason.** The code most likely to
 * trip this guard is the code that swallows errors: `fetchPublicKey` rewraps
 * anything as `JWKS fetch failed: …` and `onModuleInit` catches it and calls
 * `console.error`. A refusal raised inside that hook would be caught by the
 * thing being guarded and the run would stay green — the exact failure mode
 * MDRS-89 is about, reproduced one level up. So every refusal is also RECORDED,
 * and an `afterEach` that the swallowing code cannot reach fails the test.
 *
 * **Scope, stated honestly.** This replaces `globalThis.fetch` and nothing
 * else. It does not see `node:http` / `node:https` clients, `undici.request`,
 * or anything a child process does — `tools/keycloak/setup-realm.sh` shells out
 * to `curl` and is invisible here. Covering those means an undici
 * `setGlobalDispatcher` with a connect hook (which would reach `fetch` and
 * `undici.request` together) plus something for the http modules; that is a
 * wider change than MDRS-89 and has not been made.
 *
 * Loopback is allowed because it has a legitimate caller:
 * `keycloak-audience.e2e.spec.ts` (MDRS-42) starts its own Keycloak container
 * and talks to it on a mapped port. "No network" here means "nothing leaves
 * this machine", not "no HTTP".
 */

import { afterEach } from "vitest";
import { consumeRefusals, recordRefusal } from "./helpers/network-refusals";

afterEach(() => {
  const seen = consumeRefusals();
  if (seen.length === 0) {
    return;
  }

  throw new Error(
    `MDRS-89: ${seen.length} outbound fetch attempt(s) were refused and the ` +
      `error was swallowed by the code under test: ${seen.join(", ")}. ` +
      "The refusal itself is above; this hook exists because the caller most " +
      "likely to make one is the caller that catches its own failures."
  );
});

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

/** Testcontainers and supertest both reach their targets this way. */
function isLoopback(hostname: string): boolean {
  const normalised = hostname.toLowerCase();
  return (
    LOOPBACK_HOSTNAMES.has(normalised) ||
    normalised.endsWith(".localhost") ||
    // The whole 127.0.0.0/8 block, which Docker on some hosts hands back.
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalised)
  );
}

/**
 * Derived from `globalThis.fetch` rather than written as `RequestInfo`: this
 * package compiles with `lib: ["ES2023"]` and no DOM, so the DOM's fetch types
 * are not in scope. `@types/node` supplies the runtime one.
 */
type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];

function urlOf(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
  const target = urlOf(input);

  let hostname: string;
  try {
    hostname = new URL(target).hostname;
  } catch {
    // A relative or otherwise unparseable URL cannot name a remote host, and
    // refusing it here would turn a test's own bug into a confusing network
    // error. Let the real fetch produce its own message.
    return realFetch(input, init);
  }

  if (!isLoopback(hostname)) {
    recordRefusal(target);
    throw new Error(
      `MDRS-89: the tedrisat test suite tried to reach ${target}. ` +
        "Tests must not depend on a host being up — point this at a stub, a " +
        "container on loopback, or an RFC 2606 `.invalid` name. If a suite " +
        "genuinely needs a live service, it needs its own decision and its " +
        "own issue, not a hole in this guard. See " +
        "apps/tedrisat/test/setup-no-network.ts."
    );
  }

  // A loopback URL can still answer 302 to somewhere else, and `realFetch`
  // follows redirects inside itself — the wrapper is not re-entered, so the
  // hostname check above would never see the second hop.
  //
  // `manual` internally, never `error`: `error` makes undici raise a bare
  // `TypeError: unexpected redirect`, which carries none of the context this
  // file promises and reads like a bug in the application. Taking the response
  // back unfollowed lets the refusal below name the hop it refused.
  const wantsManual = init?.redirect === "manual";
  const response = await realFetch(input, { ...init, redirect: "manual" });

  // A caller that asked for `manual` gets the 3xx to deal with itself, and
  // whatever it fetches next comes back through this guard.
  if (wantsManual || response.status < 300 || response.status >= 400) {
    return response;
  }

  const location = response.headers.get("location");
  recordRefusal(`${target} → ${location ?? "(no Location header)"}`);
  throw new Error(
    `MDRS-89: ${target} answered ${response.status} redirecting to ` +
      `${location ?? "an unnamed location"}, and the suite does not follow ` +
      "redirects — the second hop would bypass the loopback check that let " +
      'the first one through. Ask for `redirect: "manual"` and follow it ' +
      "yourself if the target is loopback. See " +
      "apps/tedrisat/test/setup-no-network.ts."
  );
}) as typeof globalThis.fetch;
