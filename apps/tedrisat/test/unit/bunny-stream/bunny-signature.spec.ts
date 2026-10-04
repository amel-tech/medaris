import {
  BUNNY_TUS_ENDPOINT,
  DEFAULT_UPLOAD_LIFETIME_SECONDS,
  EMBED_LINK_LIFETIME_SECONDS,
  embedUrl,
  embedViewToken,
  encodingOutcome,
  MIN_UPLOAD_LIFETIME_SECONDS,
  tusUploadSignature,
  uploadExpiry,
} from "../../../src/bunny-stream/bunny-signature";

/**
 * MDRS-116. The vectors below were computed outside this code, with
 * `printf '%s' "<input>" | sha256sum`, so a change in the concatenation order
 * or a separator slipping in fails here instead of at Bunny.
 */
const LIBRARY_ID = "12345";
const API_KEY = "set-me-api-key";
const TOKEN_KEY = "set-me-token-key";
const VIDEO_ID = "a1b2c3d4-0000-4000-8000-00000000abcd";
const EXPIRES = 1791100000;

describe("tusUploadSignature (MDRS-116)", () => {
  it("is SHA256_HEX(library_id + api_key + expiration + video_id)", () => {
    expect(tusUploadSignature(LIBRARY_ID, API_KEY, EXPIRES, VIDEO_ID)).toBe(
      "145739fd0669a43c19bfcf839d0f07b7f3b54f20e18309a4817791e4604c302c"
    );
  });

  it("changes with every input, so a signature is bound to one video and one expiry", () => {
    const base = tusUploadSignature(LIBRARY_ID, API_KEY, EXPIRES, VIDEO_ID);
    expect(
      tusUploadSignature(LIBRARY_ID, API_KEY, EXPIRES + 1, VIDEO_ID)
    ).not.toBe(base);
    expect(
      tusUploadSignature(LIBRARY_ID, API_KEY, EXPIRES, `${VIDEO_ID}0`)
    ).not.toBe(base);
    expect(tusUploadSignature("12346", API_KEY, EXPIRES, VIDEO_ID)).not.toBe(
      base
    );
  });

  it("never contains the API key", () => {
    expect(
      tusUploadSignature(LIBRARY_ID, API_KEY, EXPIRES, VIDEO_ID)
    ).not.toContain(API_KEY);
  });

  it("uploads to Bunny's TUS endpoint", () => {
    expect(BUNNY_TUS_ENDPOINT).toBe("https://video.bunnycdn.com/tusupload");
  });
});

describe("uploadExpiry (MDRS-116)", () => {
  const now = new Date("2026-10-04T10:00:00.500Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  it("defaults to 24 hours ahead, in whole Unix seconds", () => {
    expect(DEFAULT_UPLOAD_LIFETIME_SECONDS).toBe(86_400);
    expect(uploadExpiry(now)).toBe(nowSeconds + 86_400);
  });

  it("takes Bunny's minimum of 3600 seconds and refuses less", () => {
    expect(MIN_UPLOAD_LIFETIME_SECONDS).toBe(3600);
    expect(uploadExpiry(now, 3600)).toBe(nowSeconds + 3600);
    expect(() => uploadExpiry(now, 3599)).toThrow(RangeError);
    expect(() => uploadExpiry(now, 3600.5)).toThrow(RangeError);
  });
});

describe("embed links (MDRS-116)", () => {
  it("signs the token as SHA256_HEX(token_key + video_id + expiration)", () => {
    expect(embedViewToken(TOKEN_KEY, VIDEO_ID, EXPIRES)).toBe(
      "e703a6dd7fd58cea6dfb43078445c3021deb828fb3cf5e81765511ccbf0b6a10"
    );
  });

  it("is Bunny's iframe player, with no token when the library has no token key", () => {
    expect(embedUrl(LIBRARY_ID, VIDEO_ID, null, new Date())).toBe(
      `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${VIDEO_ID}`
    );
  });

  it("carries a token and its expiry when the library has a token key", () => {
    const now = new Date((EXPIRES - EMBED_LINK_LIFETIME_SECONDS) * 1000);
    expect(embedUrl(LIBRARY_ID, VIDEO_ID, TOKEN_KEY, now)).toBe(
      `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${VIDEO_ID}?token=e703a6dd7fd58cea6dfb43078445c3021deb828fb3cf5e81765511ccbf0b6a10&expires=${EXPIRES}`
    );
  });
});

describe("encodingOutcome (MDRS-116)", () => {
  const expires = new Date("2026-10-05T10:00:00Z");
  const before = new Date("2026-10-05T09:59:59Z");
  const after = new Date("2026-10-05T10:00:00Z");

  it("is READY once Bunny has finished, and FAILED on an error or a failed upload", () => {
    expect(encodingOutcome(4, expires, before)).toBe("READY");
    expect(encodingOutcome(5, expires, before)).toBe("FAILED");
    expect(encodingOutcome(6, expires, before)).toBe("FAILED");
  });

  it("waits on a video with no complete upload until its lifetime passes, then fails it", () => {
    expect(encodingOutcome(0, expires, before)).toBeNull();
    expect(encodingOutcome(0, expires, after)).toBe("FAILED");
  });

  it("keeps waiting on an upload that arrived and is still encoding, even past the lifetime", () => {
    for (const status of [1, 2, 3, 7, 8]) {
      expect(encodingOutcome(status, expires, after)).toBeNull();
    }
  });
});
