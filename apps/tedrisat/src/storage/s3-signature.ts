import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 for the four S3 calls tedrisat makes to Bunny
 * Storage (MDRS-287): PUT, GET, HEAD and DELETE of one object, path-style,
 * with the whole payload hashed (no `aws-chunked` streaming, which the AWS
 * SDKs now send by default and an S3-compatible store need not accept). Kept
 * this small instead of pulling an SDK: the store is reached for four verbs
 * and the signature is fixed by the S3 documentation, which
 * `test/unit/storage/s3-signature.spec.ts` checks it against.
 */

export interface IS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface IS3SignInput {
  method: "GET" | "HEAD" | "PUT" | "DELETE";
  /** The request URL, its path already encoded by `objectPath`. */
  url: URL;
  region: string;
  credentials: IS3Credentials;
  /** Lowercase hex SHA-256 of the body, `EMPTY_PAYLOAD_SHA256` for none. */
  payloadSha256: string;
  /** Other headers to sign and send, e.g. `content-type` or `range`. */
  headers?: Record<string, string>;
  now: Date;
}

export const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

/** RFC 3986 percent-encoding, which S3 asks for: `encodeURIComponent` leaves `!'()*` alone. */
export const uriEncode = (segment: string): string =>
  encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

/** `/<bucket>/<key>` with every segment encoded once, as the canonical request and the URL both use it. */
export const objectPath = (bucket: string, key: string): string =>
  `/${uriEncode(bucket)}/${key.split("/").map(uriEncode).join("/")}`;

/** `20130524T000000Z`. */
const amzDateOf = (now: Date): string =>
  now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

function canonicalQuery(url: URL): string {
  const pairs = [...url.searchParams.entries()].map(
    ([k, v]) => [uriEncode(k), uriEncode(v)] as const
  );
  pairs.sort(([a, av], [b, bv]) =>
    a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0
  );
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * The headers that make the request an authenticated one: every header in
 * `input.headers`, `x-amz-date`, `x-amz-content-sha256` and `authorization`.
 * `host` is signed but not returned, as fetch sets it from the URL.
 */
export function signS3Request(input: IS3SignInput): Record<string, string> {
  const amzDate = amzDateOf(input.now);
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(input.headers ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        v.trim().replace(/\s+/g, " "),
      ])
    ),
    "x-amz-content-sha256": input.payloadSha256,
    "x-amz-date": amzDate,
  };
  const signed: Record<string, string> = { ...headers, host: input.url.host };
  const names = Object.keys(signed).sort();
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    canonicalQuery(input.url),
    names.map((name) => `${name}:${signed[name]}\n`).join(""),
    names.join(";"),
    input.payloadSha256,
  ].join("\n");
  const scope = `${date}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(
        hmac(`AWS4${input.credentials.secretAccessKey}`, date),
        input.region
      ),
      "s3"
    ),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}
