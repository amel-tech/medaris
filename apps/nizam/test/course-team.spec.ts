import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";

type Catalogue = Record<string, Record<string, string>>;
const nizamCatalogue = (locale: "tr" | "en" | "ar"): Catalogue =>
  resources[locale].nizam as unknown as Catalogue;

import {
  courseTeamErrorKey,
  mayAssignMuderris,
  rosterActions,
  userDisplayName,
} from "~/features/kosks/course-team";

const KOSK = "k0000000-0000-4000-8000-000000000001";
type Me = Parameters<typeof mayAssignMuderris>[0];
const me = (roles: Record<string, unknown>): Me =>
  ({
    roles: {
      systemAdmin: false,
      nazirOf: [],
      manages: [],
      teaches: [],
      ...roles,
    },
  }) as Me;

describe("mayAssignMuderris (MDRS-105)", () => {
  it("is the köşk's manager or SYSTEM_ADMIN, and nobody else", () => {
    expect(
      mayAssignMuderris(me({ manages: [{ id: KOSK, name: "Köşk" }] }), KOSK)
    ).toBe(true);
    expect(mayAssignMuderris(me({ systemAdmin: true }), KOSK)).toBe(true);
    // A müderris of one of the köşk's courses, managing another köşk.
    expect(
      mayAssignMuderris(
        me({
          manages: [{ id: "k0000000-0000-4000-8000-000000000002", name: "" }],
          teaches: [{ id: "c1", title: "Ders", koskId: KOSK }],
        }),
        KOSK
      )
    ).toBe(false);
    expect(mayAssignMuderris(null, KOSK)).toBe(false);
  });
});

describe("userDisplayName", () => {
  it("joins the names, and falls back to the address", () => {
    expect(
      userDisplayName({
        givenName: " Musa ",
        familyName: "Efendi",
        email: "m@example.com",
      })
    ).toBe("Musa Efendi");
    expect(
      userDisplayName({
        givenName: undefined,
        familyName: "  ",
        email: "m@example.com",
      })
    ).toBe("m@example.com");
  });
});

describe("courseTeamErrorKey", () => {
  it("maps the API's refusals to keys every locale has", () => {
    const codes = [
      "MUDERRIS_ASSIGNMENT_FORBIDDEN",
      "MUDERRIS_UNKNOWN_USER",
      "MUDERRIS_DUPLICATE_USER",
      "USER_LOOKUP_FORBIDDEN",
      "ENROLLMENT_STATE_CONFLICT",
      "ENROLLMENT_NOT_FOUND",
      "AUTHZ_FORBIDDEN",
    ];
    for (const code of codes) {
      const key = courseTeamErrorKey({ code });
      expect(key).toMatch(/^CourseTeam\./);
      for (const locale of ["tr", "en", "ar"] as const) {
        const [ns = "", name = ""] = (key as string).split(".");
        expect(nizamCatalogue(locale)[ns]?.[name]).toBeTruthy();
      }
    }
  });

  it("leaves anything else to the API's own message", () => {
    expect(courseTeamErrorKey({ code: "SOMETHING_ELSE" })).toBeNull();
    expect(courseTeamErrorKey({ code: "toString" })).toBeNull();
    expect(courseTeamErrorKey(undefined)).toBeNull();
    expect(courseTeamErrorKey("nope")).toBeNull();
  });
});

describe("rosterActions", () => {
  it("offers approve/reject for a request, complete/remove for a seat, reopen for a completion", () => {
    expect(rosterActions("PENDING")).toEqual(["approve", "reject"]);
    expect(rosterActions("ENROLLED")).toEqual(["complete", "remove"]);
    expect(rosterActions("COMPLETED")).toEqual(["reopen"]);
  });
});

describe("CourseTeam catalogue", () => {
  it("has the same keys in tr, en and ar", () => {
    const keys = (locale: "tr" | "en" | "ar") =>
      Object.keys(nizamCatalogue(locale).CourseTeam ?? {}).sort();
    expect(keys("en")).toEqual(keys("tr"));
    expect(keys("ar")).toEqual(keys("tr"));
  });
});
