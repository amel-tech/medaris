import { describe, expect, it } from "vitest";
import {
  PRIVACY_NOTICE_PATH,
  PRIVACY_NOTICE_URL,
  privacyNoticeUrl,
} from "../src/privacy-notice";

describe("privacyNoticeUrl (MDRS-248)", () => {
  it("points at the environment's own landing when one is given", () => {
    expect(privacyNoticeUrl("https://landing-dev.medaris.app")).toBe(
      `https://landing-dev.medaris.app${PRIVACY_NOTICE_PATH}`
    );
  });

  it("ignores a trailing slash or a path on the origin", () => {
    expect(privacyNoticeUrl("http://localhost:4003/")).toBe(
      `http://localhost:4003${PRIVACY_NOTICE_PATH}`
    );
    expect(privacyNoticeUrl("https://landing-dev.medaris.app/tr")).toBe(
      `https://landing-dev.medaris.app${PRIVACY_NOTICE_PATH}`
    );
  });

  it.each([undefined, ""])("falls back to production for %j", (value) => {
    expect(privacyNoticeUrl(value)).toBe(PRIVACY_NOTICE_URL);
  });
});
