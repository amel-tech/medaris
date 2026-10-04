import { describe, expect, it } from "vitest";
import { koskEntry, needsHostingRead } from "~/features/kosks/kosk-entry";

/**
 * Where `/kosks/:id` sends the person (MDRS-137). The page itself, a server
 * component behind the sign-in, is not rendered here; this pins the decision it
 * takes, and Playwright covers the redirect where an account exists.
 */
const KOSK = "a0000000-0000-4000-8000-000000000001";
const OTHER_KOSK = "a0000000-0000-4000-8000-000000000002";

const me = (
  over: { systemAdmin?: boolean; manages?: string[] } = {}
): Parameters<typeof koskEntry>[0] =>
  ({
    roles: {
      systemAdmin: over.systemAdmin ?? false,
      manages: (over.manages ?? []).map((id) => ({ id })),
    },
  }) as Parameters<typeof koskEntry>[0];

describe("koskEntry", () => {
  it("gives the başnazım the management view whatever the hosting read said", () => {
    for (const rights of [[], "forbidden", "not-found", null] as const) {
      expect(koskEntry(me({ systemAdmin: true }), KOSK, rights)).toEqual({
        to: "management",
      });
    }
  });

  it("sends a nazımı of this köşk to Dersler", () => {
    expect(koskEntry(me({ manages: [KOSK] }), KOSK, null)).toEqual({
      to: "dersler",
    });
  });

  it("sends a nazımı of another köşk, whom the API refuses, to the forbidden screen", () => {
    expect(koskEntry(me({ manages: [OTHER_KOSK] }), KOSK, "forbidden")).toEqual(
      { to: "forbidden" }
    );
  });

  it("sends a Medaris nazımı whom the API lets read the rights to Barındırma hakları", () => {
    expect(koskEntry(me(), KOSK, [])).toEqual({ to: "hosting" });
    expect(koskEntry(me(), KOSK, [{ madrasahId: "m1" }])).toEqual({
      to: "hosting",
    });
  });

  it.each([
    ["forbidden", "forbidden"],
    ["not-found", "not-found"],
    ["a read that failed", null],
  ] as const)("sends anyone else to the forbidden screen when the hosting read is %s", (_what, rights) => {
    expect(koskEntry(me(), KOSK, rights)).toEqual({ to: "forbidden" });
  });

  it("keeps the management view when the roles could not be read, and lets the API refuse", () => {
    expect(koskEntry(null, KOSK, null)).toEqual({ to: "management" });
  });
});

describe("needsHostingRead", () => {
  it("is true only for someone who is neither the başnazım nor this köşk's nazımı", () => {
    expect(needsHostingRead(me(), KOSK)).toBe(true);
    expect(needsHostingRead(me({ manages: [OTHER_KOSK] }), KOSK)).toBe(true);
    expect(needsHostingRead(me({ manages: [KOSK] }), KOSK)).toBe(false);
    expect(needsHostingRead(me({ systemAdmin: true }), KOSK)).toBe(false);
    expect(needsHostingRead(null, KOSK)).toBe(false);
  });
});
