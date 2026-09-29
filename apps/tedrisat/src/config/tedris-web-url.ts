/**
 * Where tedris-web answers, so that tedrisat can write links to its pages
 * (MDRS-117: the session page a calendar entry points at).
 *
 * Optional on purpose. Unset, the routes that need it answer 503 and name
 * this key; the rest of the API boots and serves as before. That keeps a
 * deployment that has not set it yet from restart-looping over a feature
 * nobody has used. A value that is set but not an absolute http(s) URL is a
 * typo, not a choice, so that stops the boot.
 *
 * Set as `TEDRISAT__TEDRIS_WEB_URL` in the repository-root `.env`; MDRS-25
 * strips the prefix on the way in.
 */
export function readTedrisWebUrl(env: NodeJS.ProcessEnv): string | null {
  const raw = env.TEDRIS_WEB_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail(raw, "is not an absolute URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return fail(raw, "is not an http(s) URL");
  }
  if (url.search || url.hash || url.username || url.password) {
    return fail(raw, "carries a query, fragment or credentials");
  }
  // Links are built as `${base}/courses/...`; a trailing slash would double it.
  return url.href.replace(/\/+$/, "");
}

function fail(raw: string, reason: string): never {
  throw new Error(
    `TEDRIS_WEB_URL is not usable: "${raw}" ${reason}. ` +
      "Set it to tedris-web's public origin, as in " +
      "TEDRISAT__TEDRIS_WEB_URL=http://localhost:4000 in the repository-root .env."
  );
}
