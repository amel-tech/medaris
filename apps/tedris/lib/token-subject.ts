/**
 * Reads the `sub` claim out of a JWT without verifying it.
 *
 * This is for DISPLAY ONLY — deciding whether to render an owner-only control.
 * It is not an authorization check: the API re-derives the caller from the
 * token it verifies itself, and enforcement of who may mutate a deck belongs
 * there (MDRS-43). Never gate a mutation on this value alone.
 */
export function subjectOf(token: string | undefined): string | undefined {
  if (!token) return undefined;

  const payload = token.split(".")[1];
  if (!payload) return undefined;

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : undefined;
  } catch {
    return undefined;
  }
}
