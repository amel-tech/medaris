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
 * kept happening. A future provider that reintroduces a fetch now fails the
 * run instead of adding a line nobody reads.
 *
 * Loopback is allowed because it has a legitimate caller:
 * `keycloak-audience.e2e.spec.ts` (MDRS-42) starts its own Keycloak container
 * and talks to it on a mapped port. "No network" here means "nothing leaves
 * this machine", not "no HTTP".
 */

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
  // hostname check above would never see the second hop. Refusing to follow at
  // all is what closes that: the check runs on every URL this suite actually
  // requests, because every hop has to be requested explicitly.
  //
  // `manual` is honoured when a caller asks for it, since it hands the response
  // back without following and a caller that then fetches the `Location` comes
  // back through here. Anything else — including an explicit `follow` — becomes
  // `error`, because honouring it would reopen the hole it is meant to close.
  // A suite that genuinely needs a loopback redirect followed asks for
  // `manual` and follows it itself.
  const redirect = init?.redirect === "manual" ? "manual" : "error";

  return realFetch(input, { ...init, redirect });
}) as typeof globalThis.fetch;
