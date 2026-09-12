/**
 * How many reverse-proxy hops in front of this process to trust when reading
 * the client's address (MDRS-31 follow-up).
 *
 * `ThrottlerGuard`'s default tracker is `req.ips[0] ?? req.ip` — Express only
 * populates `req.ips` from `X-Forwarded-For` when `app.set("trust proxy", …)`
 * is enabled, and neither app ever called it before this. Every request then
 * resolved to the raw socket peer, which behind any reverse proxy (this
 * deployment's target, Coolify, fronts every service with one) is the proxy's
 * own address for 100% of traffic — collapsing the per-client rate limit into
 * one shared bucket for the whole deployment.
 *
 * Defaults to 0 — Express's own default, meaning nothing is trusted and
 * `req.ip` stays the socket peer — so a deployment that never sets this keeps
 * exactly today's behaviour. Local compose and CI have no proxy in front and
 * must stay at 0; a deployment with exactly one reverse proxy in front sets
 * this to 1. Deliberately not `true`: that trusts the entire
 * `X-Forwarded-For` chain a client can prepend to arbitrarily, which would
 * turn the shared-bucket problem this fixes into a bypassable one instead. A
 * count anchors trust to a fixed number of hops from the socket, which a
 * client cannot lengthen.
 */
export function resolveTrustProxyHops(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.TRUST_PROXY_HOPS?.trim();

  if (!raw) {
    return 0;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `TRUST_PROXY_HOPS is not usable: "${raw}" is not a whole number. ` +
        "Set it to the number of reverse-proxy hops in front of this " +
        "process — 0 if there is none, as in a local compose run."
    );
  }

  return Number(raw);
}
