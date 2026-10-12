import { AUTH_BASE_PATH } from "../shared/routes";

/**
 * The request header `proxy.ts` hands the render: the path and query of the
 * page being served. Server Components cannot see their own URL, so this is
 * how `requireSession()` keeps the destination when a caller passes none
 * (D4: nazar's redirect lost it). Set by the proxy on every request it
 * passes through, over whatever the browser sent; read through
 * `safeReturnTo` like every other return path, so a forged one can at most
 * name another page of the same app.
 */
export const RETURN_TO_HEADER = "x-medaris-auth-return-to";

const MAX_LENGTH = 2048;

const hasControlCharacter = (value: string) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
};

/**
 * `value` as a same-origin path (with its query and fragment), or `null` when
 * it names anything else: another origin (`https://evil.example`,
 * `//evil.example`, `/\evil.example`), another scheme (`javascript:`), or one
 * of the auth routes themselves, which would only start the flow again. The
 * one check every redirect target passes, so no route here is an open
 * redirect.
 */
export function safeReturnTo(
  value: string | null | undefined,
  origin: string
): string | null {
  if (!value || value.length > MAX_LENGTH || hasControlCharacter(value)) {
    return null;
  }
  let target: URL;
  try {
    target = new URL(value, origin);
  } catch {
    return null;
  }
  if (target.origin !== origin) return null;
  const path = target.pathname;
  if (path === AUTH_BASE_PATH || path.startsWith(`${AUTH_BASE_PATH}/`)) {
    return null;
  }
  return `${path}${target.search}${target.hash}`;
}

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;

/**
 * `value` when it may be passed to the IdP as `ui_locales`: one of `locales`
 * when the app lists them, otherwise any well-formed language tag. `null` for
 * anything else, so a crafted parameter never reaches the IdP's URL.
 */
export function acceptedLocale(
  value: unknown,
  locales: readonly string[] | undefined
): string | null {
  if (typeof value !== "string" || !value || value.length > 35) return null;
  if (locales) return locales.includes(value) ? value : null;
  return LANGUAGE_TAG.test(value) ? value : null;
}
