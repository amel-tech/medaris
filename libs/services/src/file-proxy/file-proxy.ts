import { unauthenticated } from "@medaris/auth/server";

/**
 * One proxy for files between the browser and tedrisat (MDRS-287, MDRS-290).
 *
 * The browser cannot call tedrisat itself: the access token stays on the
 * server, and the generated client reads every answer as JSON. A web app's
 * route handler therefore hands a file upload or download to these two
 * functions, which add the bearer token and pass the body through as a
 * stream. They live here once so that tedris, nazar and nizam do not each
 * keep a hand-copied proxy that drifts from the others (auth audit).
 */

/** tedrisat's limit for one file: `MAX_UPLOAD_BYTES` in its `storage/upload.ts`. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * What a multipart body may carry besides the file (boundaries, part headers,
 * a few short fields). The same allowance as tedrisat's upload gate, so the
 * two refuse the same announced sizes.
 */
export const MULTIPART_ALLOWANCE_BYTES = 64 * 1024;

/** The only tedrisat paths these functions reach. */
export const FILE_PROXY_PATH_PREFIXES = ["/courses/", "/lessons/"] as const;

/**
 * The headers of a download that reach the browser, and no others: a cookie,
 * a CORS grant or a storage header tedrisat (or anything in front of it) might
 * add is not this app's to repeat on its own origin.
 */
export const DOWNLOAD_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "x-content-type-options",
  "cache-control",
  "content-security-policy",
] as const;

/** Where a proxied request goes, and as whom. */
export interface FileProxyTarget {
  /** tedrisat's base address, e.g. `env.TEDRISAT_API_BASE_URL`. */
  apiBaseUrl: string;
  /**
   * The tedrisat path, built by the route handler from params it has checked
   * (`isUuid`). Anything `isProxiablePath` refuses answers 400 unsent.
   */
  path: string;
  /**
   * `await getAccessToken()` from the app's `lib/auth.ts`. None answers 401
   * `{ kind: "unauthenticated" }`: an API route never redirects.
   */
  accessToken: string | null | undefined;
}

export interface ProxyUploadOptions extends FileProxyTarget {
  /** The largest file accepted, usually `MAX_FILE_BYTES`. */
  maxBytes: number;
}

export interface ProxyDownloadOptions extends FileProxyTarget {
  /** Usually `request.signal`: a browser that leaves stops the transfer. */
  signal?: AbortSignal;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a route param is a UUID, as tedrisat's ids are. */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/**
 * One or more segments of letters, digits, `-` and `_` and nothing else: no
 * `.` (so no `..`), no empty segment (so no `//`), no `?`, `#`, `%` or `\`,
 * so a param cannot add a query, re-encode a traversal or leave the prefix.
 */
const SEGMENTS = /^(?:\/[A-Za-z0-9_-]+)+$/;

/** Whether `path` is one these functions may send to tedrisat. */
export const isProxiablePath = (path: string): boolean =>
  path.length <= 512 &&
  FILE_PROXY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
  SEGMENTS.test(path);

const MULTIPART = /^multipart\/form-data\s*;(?:.*;)?\s*boundary=[^\s;]/i;
const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json\b/i;
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

const json = (body: unknown, status: number, headers?: HeadersInit) => {
  const all = new Headers(headers);
  all.set("content-type", "application/json; charset=utf-8");
  all.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: all });
};

/** The proxy's own refusals, shaped like tedrisat's (`code`, `status`, `message`). */
const refusal = (
  code: string,
  status: number,
  message: string,
  context?: Record<string, unknown>
) => json({ code, status, message, ...(context ? { context } : {}) }, status);

/**
 * No token (`reauth` false), or a token tedrisat refused (`reauth` true): the
 * answer `handleUnauthenticated` from `@medaris/auth/client` acts on.
 */
const unauthorized = (reauth: boolean) =>
  json(unauthenticated({ reauth }), 401);

const discard = (response: Response) => {
  response.body?.cancel().catch(() => undefined);
};

const precheck = ({ path, accessToken }: FileProxyTarget): Response | null => {
  if (!isProxiablePath(path)) {
    return refusal("INVALID_PATH", 400, "Not a file address");
  }
  if (!accessToken) return unauthorized(false);
  return null;
};

const urlOf = ({ apiBaseUrl, path }: FileProxyTarget) =>
  `${apiBaseUrl.replace(/\/+$/, "")}${path}`;

/** tedrisat's answer, or `null` when it could not be reached at all. */
const reach = async (
  url: string,
  init: RequestInit
): Promise<Response | null> => {
  try {
    return await fetch(url, init);
  } catch (error) {
    console.error("Error reaching tedrisat:", error);
    return null;
  }
};

const unreachable = () =>
  refusal("TEDRISAT_UNREACHABLE", 502, "The service could not be reached");

/**
 * An answer that is not a file: tedrisat's status and JSON body as they came
 * (its codes are the page's to show), a refused token as the reauth answer,
 * and anything that is not JSON (an HTML error page from something in front
 * of tedrisat) as a JSON refusal rather than markup on this app's origin.
 */
const relay = (upstream: Response): Response => {
  if (upstream.status === 401) {
    discard(upstream);
    return unauthorized(true);
  }
  if (NULL_BODY_STATUSES.has(upstream.status)) {
    discard(upstream);
    return new Response(null, { status: upstream.status });
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!JSON_TYPE.test(type)) {
    discard(upstream);
    const status = upstream.ok ? 502 : upstream.status;
    return refusal(
      `HTTP_${upstream.status}`,
      status,
      "The service answered without a JSON body"
    );
  }
  const headers = new Headers({ "content-type": type });
  headers.set("cache-control", "no-store");
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
  return new Response(upstream.body, { status: upstream.status, headers });
};

/**
 * Sends the browser's multipart upload on to tedrisat as it arrives. The body
 * is never read here: the request's own stream is the body of the call to
 * tedrisat, with its `Content-Type` (and so its boundary) unchanged. A body
 * that announces more than `maxBytes` plus the multipart allowance is refused
 * with 413 FILE_TOO_LARGE before a byte of it is read; one without a length
 * is cut off by tedrisat as it streams.
 *
 * Next.js: `proxy.ts` buffers the body of every request it matches and cuts
 * it off at `proxyClientMaxBodySize` (10 MB by default). See this package's
 * README before routing an upload through it.
 */
export async function proxyUpload(
  request: Request,
  options: ProxyUploadOptions
): Promise<Response> {
  const { maxBytes } = options;
  if (!(Number.isFinite(maxBytes) && maxBytes > 0)) {
    throw new RangeError("proxyUpload: maxBytes must be a positive number");
  }
  const refused = precheck(options);
  if (refused) return refused;

  const contentType = request.headers.get("content-type") ?? "";
  if (!MULTIPART.test(contentType)) {
    return refusal(
      "MULTIPART_REQUIRED",
      415,
      "Send the file as multipart/form-data"
    );
  }
  const announced = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(announced) &&
    announced > maxBytes + MULTIPART_ALLOWANCE_BYTES
  ) {
    return refusal(
      "FILE_TOO_LARGE",
      413,
      `A file may be at most ${Math.floor(maxBytes / (1024 * 1024))} MB`,
      { maxBytes }
    );
  }
  if (!request.body) {
    return refusal("FILE_REQUIRED", 400, "Send the file, and not empty");
  }

  // `duplex: "half"` is what lets fetch send a stream; DOM's RequestInit
  // does not know it yet.
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body: request.body,
    duplex: "half",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": contentType,
      Accept: "application/json",
    },
    cache: "no-store",
    // A redirect would carry the stream and the token somewhere else.
    redirect: "error",
    signal: request.signal,
  };
  const upstream = await reach(urlOf(options), init);
  return upstream ? relay(upstream) : unreachable();
}

/**
 * Streams a file from tedrisat to the browser with the headers tedrisat set
 * for it (`DOWNLOAD_HEADERS`: the attachment name, `nosniff`, `no-store`, the
 * sandboxing CSP) and none other. A refusal (403, 404, 503 …) comes back as
 * tedrisat's JSON; a refused token as the reauth answer.
 */
export async function proxyDownload(
  options: ProxyDownloadOptions
): Promise<Response> {
  const refused = precheck(options);
  if (refused) return refused;

  const upstream = await reach(urlOf(options), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      // fetch decodes a compressed body but keeps the encoded length; asking
      // for none keeps `Content-Length` true to the bytes passed on.
      "Accept-Encoding": "identity",
    },
    cache: "no-store",
    redirect: "error",
    signal: options.signal,
  });
  if (!upstream) return unreachable();
  if (!upstream.ok) return relay(upstream);

  const headers = new Headers();
  for (const name of DOWNLOAD_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const encoding = upstream.headers.get("content-encoding");
  if (encoding && encoding !== "identity") headers.delete("content-length");
  return new Response(upstream.body, { status: upstream.status, headers });
}
