import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import { withoutLinkKey } from "~/features/courses/attendance";

describe("how a celse without a link is attended (MDRS-283)", () => {
  it("names the stream, the in-person mark, or both, and nothing for neither", () => {
    expect(withoutLinkKey({ hasLiveStream: true }, false)).toBe("stream");
    expect(withoutLinkKey({ hasLiveStream: true }, true)).toBe("streamLive");
    expect(withoutLinkKey({ inPerson: true }, false)).toBe("inPerson");
    expect(withoutLinkKey({ inPerson: true }, true)).toBe("inPerson");
    expect(withoutLinkKey({ inPerson: true, hasLiveStream: true }, false)).toBe(
      "inPersonStream"
    );
    expect(withoutLinkKey({ inPerson: true, hasLiveStream: true }, true)).toBe(
      "inPersonStreamLive"
    );
    expect(
      withoutLinkKey({ inPerson: false, hasLiveStream: false }, false)
    ).toBe("noLink");
  });

  it("reads a caller who was sent neither flag as having no link yet", () => {
    expect(withoutLinkKey({}, false)).toBe("noLink");
    expect(withoutLinkKey({ inPerson: null, hasLiveStream: null }, true)).toBe(
      "noLink"
    );
  });

  it("has every sentence it names, in every locale", () => {
    const keys = [
      "noLink",
      "inPerson",
      "stream",
      "streamLive",
      "inPersonStream",
      "inPersonStreamLive",
    ];
    for (const locale of ["tr", "en", "ar"] as const) {
      const page = resources[locale].tedris.SchedulePage as Record<
        string,
        string
      >;
      for (const key of keys) {
        expect(page[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });
});
