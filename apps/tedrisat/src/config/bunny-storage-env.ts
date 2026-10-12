/**
 * The Bunny Storage zone tedrisat keeps uploaded files in (MDRS-287), reached
 * through Bunny's S3-compatible API: a storage zone is the bucket, the zone's
 * name is the access key id and its password is the secret.
 */
export interface IBunnyStorageConfig {
  /** The regional S3 endpoint, e.g. `https://de-s3.storage.bunnycdn.com`, without a trailing slash. */
  endpoint: string;
  /** The region the requests are signed for: the endpoint's region code, e.g. `de`. */
  region: string;
  /** The storage zone's name. */
  bucket: string;
  accessKeyId: string;
  /** The zone's password. Signs every request; never leaves tedrisat. */
  secretAccessKey: string;
  /**
   * The first segment of every key this environment writes, e.g. `prod` or
   * `local-dev`, so that two environments sharing a zone never touch each
   * other's files.
   */
  keyPrefix: string;
}

const KEYS = [
  "BUNNY_STORAGE_ENDPOINT",
  "BUNNY_STORAGE_REGION",
  "BUNNY_STORAGE_BUCKET",
  "BUNNY_STORAGE_ACCESS_KEY_ID",
  "BUNNY_STORAGE_SECRET_ACCESS_KEY",
  "BUNNY_STORAGE_KEY_PREFIX",
] as const;

const REGION = /^[a-z0-9-]{1,32}$/;
const BUCKET = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const PREFIX = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Reads the six `BUNNY_STORAGE_*` keys (`TEDRISAT__BUNNY_STORAGE_*` in the
 * root `.env`).
 *
 * Optional on purpose, like the Bunny Stream library: with none of them set
 * the API boots and every upload and download route answers 503
 * STORAGE_NOT_CONFIGURED. Some but not all set is a typo, so that stops the
 * boot, as does a value of the wrong shape. The endpoint must be an https
 * origin (plain http only on a loopback host, for a local S3 stand-in); the
 * key prefix is one lowercase segment, as it is the first part of every key.
 * No value is ever printed: a refusal names the key, never what it holds.
 */
export function readBunnyStorageConfig(
  env: NodeJS.ProcessEnv
): IBunnyStorageConfig | null {
  const values = Object.fromEntries(
    KEYS.map((key) => [key, env[key]?.trim() ?? ""])
  ) as Record<(typeof KEYS)[number], string>;
  const missing = KEYS.filter((key) => !values[key]);
  if (missing.length === KEYS.length) return null;
  if (missing.length > 0) {
    throw new Error(
      `Bunny Storage is half configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set. ` +
        "Set all six BUNNY_STORAGE_* keys or none (TEDRISAT__BUNNY_STORAGE_* in the root .env)."
    );
  }
  return {
    endpoint: readEndpoint(values.BUNNY_STORAGE_ENDPOINT),
    region: matching(
      "BUNNY_STORAGE_REGION",
      values.BUNNY_STORAGE_REGION,
      REGION
    ),
    bucket: matching(
      "BUNNY_STORAGE_BUCKET",
      values.BUNNY_STORAGE_BUCKET,
      BUCKET
    ),
    accessKeyId: values.BUNNY_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: values.BUNNY_STORAGE_SECRET_ACCESS_KEY,
    keyPrefix: matching(
      "BUNNY_STORAGE_KEY_PREFIX",
      values.BUNNY_STORAGE_KEY_PREFIX,
      PREFIX
    ),
  };
}

function matching(key: string, value: string, shape: RegExp): string {
  if (!shape.test(value)) {
    throw new Error(`${key} has the wrong shape (expected ${shape.source}).`);
  }
  return value;
}

function readEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("BUNNY_STORAGE_ENDPOINT is not a URL.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !(url.protocol === "https:" || (url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "BUNNY_STORAGE_ENDPOINT must be an https origin with no path, e.g. https://de-s3.storage.bunnycdn.com."
    );
  }
  return url.origin;
}
