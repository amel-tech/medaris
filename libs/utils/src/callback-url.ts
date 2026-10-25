/**
 * Turns the `callbackUrl` an app's sign-in page is given into a same-origin
 * path, or `null` when it names no real destination (MDRS-101).
 *
 * `@medaris/auth` sends the page its proxy stopped (`/learning`); NextAuth,
 * before it, sent the app's own origin when nothing was asked for, and an old
 * link may still carry that. The origin, the root and anything off-origin all
 * count as "no destination" — the last one also keeps the sign-in page from
 * becoming an open redirect.
 *
 * Here rather than in either web app because both use it and neither has a
 * test runner of its own for pure helpers like this one.
 */
export const destinationFromCallback = (
  callbackUrl: string | null | undefined,
  { baseUrl }: { baseUrl: string }
): string | null => {
  if (!callbackUrl) return null;

  let target: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    target = new URL(callbackUrl, base);
  } catch {
    return null;
  }
  if (target.origin !== base.origin) return null;

  const path = target.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return null;

  return `${path}${target.search}${target.hash}`;
};
