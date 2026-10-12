/**
 * Cookie plumbing: one sealed value per cookie family, split into numbered
 * chunks when it would not fit one cookie, and the attributes every auth
 * cookie carries.
 *
 * A browser keeps at most about 4096 bytes per cookie, name and attributes
 * included. The session holds three tokens (access, refresh, ID), so it can
 * pass that; it is then written as `<name>.0`, `<name>.1`, … and read back by
 * joining them in order. Writing always removes the family members the new
 * value does not use, so a session that shrank leaves no stale chunk behind to
 * be glued onto the next read.
 */

/** The longest value written into one cookie. */
export const CHUNK_SIZE = 3800;

/** What reading needs: `cookies()` from `next/headers`, or `request.cookies`. */
export interface CookieSource {
  get(name: string): { value: string } | undefined;
  getAll(): Array<{ name: string; value: string }>;
}

/** One cookie to set; `maxAge: 0` removes it. */
export interface CookieWrite {
  name: string;
  value: string;
  maxAge: number;
}

/** What writing needs: `response.cookies`, or `cookies()` in a route handler. */
export interface CookieSink {
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      path: string;
      maxAge: number;
    }
  ): unknown;
}

/** What forwarding to the render needs: `request.cookies` in `proxy.ts`. */
export interface RequestCookieJar {
  set(name: string, value: string): unknown;
  delete(name: string): unknown;
}

const isFamilyMember = (family: string, name: string) =>
  name === family ||
  (name.startsWith(`${family}.`) &&
    /^\d+$/.test(name.slice(family.length + 1)));

/** The value stored under `name`, joined from its chunks; `undefined` when absent. */
export function readChunked(
  source: CookieSource,
  name: string
): string | undefined {
  const whole = source.get(name)?.value;
  if (whole) return whole;
  let joined = "";
  for (let index = 0; ; index++) {
    const part = source.get(`${name}.${index}`)?.value;
    if (!part) break;
    joined += part;
  }
  return joined || undefined;
}

/**
 * The writes that store `value` under `name` (or remove it, for `null`): one
 * cookie when it fits, numbered chunks when it does not, and a removal for
 * every other member of the family the browser sent.
 */
export function chunkedWrites(
  source: CookieSource,
  name: string,
  value: string | null,
  maxAge: number,
  chunkSize = CHUNK_SIZE
): CookieWrite[] {
  const writes: CookieWrite[] = [];
  const kept = new Set<string>();
  if (value !== null) {
    if (value.length <= chunkSize) {
      writes.push({ name, value, maxAge });
      kept.add(name);
    } else {
      for (let start = 0, index = 0; start < value.length; index++) {
        const chunkName = `${name}.${index}`;
        writes.push({
          name: chunkName,
          value: value.slice(start, start + chunkSize),
          maxAge,
        });
        kept.add(chunkName);
        start += chunkSize;
      }
    }
  }
  for (const { name: present } of source.getAll()) {
    if (isFamilyMember(name, present) && !kept.has(present)) {
      writes.push({ name: present, value: "", maxAge: 0 });
    }
  }
  return writes;
}

/** HttpOnly, SameSite=Lax, Path=/, Secure over https: every auth cookie. */
export const cookieAttributes = (secure: boolean, maxAge: number) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export function writeCookies(
  sink: CookieSink,
  writes: readonly CookieWrite[],
  secure: boolean
): void {
  for (const write of writes) {
    // A removal carries the same attributes as the cookie it removes: a
    // browser ignores a `__Host-` Set-Cookie without Secure and Path=/.
    sink.set(write.name, write.value, cookieAttributes(secure, write.maxAge));
  }
}

/**
 * Applies the same writes to the incoming request's cookies, so the page that
 * renders after `proxy.ts` reads the new session rather than the one the
 * browser sent.
 */
export function forwardCookies(
  jar: RequestCookieJar,
  writes: readonly CookieWrite[]
): void {
  for (const write of writes) {
    if (write.maxAge === 0) jar.delete(write.name);
    else jar.set(write.name, write.value);
  }
}
