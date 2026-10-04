import { resources } from "@medaris/i18n";
import type { PassivationImpactResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  canConfirm,
  changedImpact,
  hiddenCourseCount,
  impactLines,
  type PassivationState,
  passivationErrorKey,
} from "~/features/passivation/present";

const impact = (
  over: Partial<PassivationImpactResponse> = {}
): PassivationImpactResponse => ({
  scope: { type: "KOSK", id: "k1", name: "Nûruosmaniye Köşkü" },
  alreadyPassive: false,
  closesContent: true,
  staffLeaving: 1,
  courses: {
    total: 4,
    published: 3,
    draft: 1,
    withLiveMuderris: 2,
    items: [
      {
        id: "c1",
        title: "Emsile ve Bina",
        koskName: "Nûruosmaniye Köşkü",
        status: "PUBLISHED",
        liveMuderris: true,
        enrolled: 2,
        completed: 1,
      },
    ],
    truncated: true,
  },
  students: { enrolled: 3, completed: 1 },
  sessions: { windowDays: 7, count: 2, next: [] },
  confirmation: "a".repeat(64),
  ...over,
});

describe("impactLines (MDRS-227)", () => {
  it("says what a köşk's passivation takes along, number by number", () => {
    expect(impactLines(impact(), "KOSK")).toEqual([
      { key: "staffKosk", values: { count: 1 } },
      { key: "courses", values: { count: 4, published: 3, draft: 1 } },
      { key: "coursesLive", values: { count: 2 } },
      { key: "students", values: { count: 3 } },
      { key: "studentsCompleted", values: { count: 1 } },
      { key: "sessions", values: { days: 7, count: 2 } },
    ]);
  });

  it("names the başmüderris for a medrese and says so when no one holds the post", () => {
    expect(impactLines(impact(), "MADRASAH")[0]).toEqual({
      key: "staffMadrasah",
    });
    expect(impactLines(impact({ staffLeaving: 0 }), "MADRASAH")[0]).toEqual({
      key: "noStaffMadrasah",
    });
    expect(impactLines(impact({ staffLeaving: 0 }), "KOSK")[0]).toEqual({
      key: "noStaffKosk",
    });
  });

  it("leaves out the talebe lines that are zero and says there are no sessions", () => {
    const keys = impactLines(
      impact({
        students: { enrolled: 0, completed: 0 },
        sessions: { windowDays: 14, count: 0, next: [] },
      }),
      "KOSK"
    );
    expect(keys.map((l) => l.key)).toEqual([
      "staffKosk",
      "courses",
      "coursesLive",
      "sessionsNone",
    ]);
    expect(keys.at(-1)?.values).toEqual({ days: 14 });
  });

  it("says there is nothing below a scope with no course", () => {
    const keys = impactLines(
      impact({
        courses: {
          total: 0,
          published: 0,
          draft: 0,
          withLiveMuderris: 0,
          items: [],
          truncated: false,
        },
      }),
      "KOSK"
    ).map((l) => l.key);
    expect(keys).toContain("coursesNone");
    expect(keys).not.toContain("courses");
    expect(keys).not.toContain("coursesLive");
  });

  it("gives the honest sentence, not a list of courses, for a scope that never had a manager", () => {
    expect(impactLines(impact({ closesContent: false }), "KOSK")).toEqual([
      { key: "staffKosk", values: { count: 1 } },
      { key: "neverAttended" },
    ]);
  });
});

describe("hiddenCourseCount", () => {
  it("counts the courses the capped list leaves out", () => {
    expect(hiddenCourseCount(impact())).toBe(3);
    expect(
      hiddenCourseCount(
        impact({
          courses: { ...impact().courses, total: 1, truncated: false },
        })
      )
    ).toBe(0);
  });
});

describe("canConfirm", () => {
  const ready = (
    over: Partial<Extract<PassivationState, { kind: "ready" }>> = {}
  ) =>
    ({
      kind: "ready",
      impact: impact(),
      changed: false,
      saving: false,
      ...over,
    }) as PassivationState;

  it("is shut while the numbers load, after a failed read, while saving and for a scope that is passive already", () => {
    expect(canConfirm({ kind: "loading" })).toBe(false);
    expect(canConfirm({ kind: "failed" })).toBe(false);
    expect(canConfirm(ready({ saving: true }))).toBe(false);
    expect(
      canConfirm(ready({ impact: impact({ alreadyPassive: true }) }))
    ).toBe(false);
  });

  it("is open once the numbers are on screen, and again for the fresh ones after a change", () => {
    expect(canConfirm(ready())).toBe(true);
    expect(canConfirm(ready({ changed: true }))).toBe(true);
  });
});

describe("passivationErrorKey and changedImpact", () => {
  it("maps the refusals the dialog knows and falls back to the generic one", () => {
    expect(passivationErrorKey({ code: "PASSIVATION_IMPACT_CHANGED" })).toBe(
      "errors.changed"
    );
    expect(passivationErrorKey({ code: "KOSK_ALREADY_PASSIVE" })).toBe(
      "errors.alreadyPassive"
    );
    expect(passivationErrorKey({ code: "MADRASAH_ALREADY_PASSIVE" })).toBe(
      "errors.alreadyPassive"
    );
    expect(passivationErrorKey({ code: "MADRASAH_NOT_FOUND" })).toBe(
      "errors.notFound"
    );
    expect(passivationErrorKey({ code: "AUTHZ_FORBIDDEN" })).toBe(
      "errors.forbidden"
    );
    expect(passivationErrorKey({ code: "WHATEVER" })).toBe("errors.generic");
    expect(passivationErrorKey(undefined)).toBe("errors.generic");
  });

  it("takes the fresh preview from a changed refusal and from nothing else", () => {
    const fresh = impact({ confirmation: "b".repeat(64) });
    expect(
      changedImpact({
        code: "PASSIVATION_IMPACT_CHANGED",
        context: { impact: fresh },
      })
    ).toBe(fresh);
    expect(
      changedImpact({
        code: "KOSK_ALREADY_PASSIVE",
        context: { impact: fresh },
      })
    ).toBeNull();
    expect(changedImpact({ code: "PASSIVATION_IMPACT_CHANGED" })).toBeNull();
    expect(
      changedImpact({
        code: "PASSIVATION_IMPACT_CHANGED",
        context: { impact: { nope: true } },
      })
    ).toBeNull();
    expect(changedImpact(undefined)).toBeNull();
  });
});

describe("the dialog's copy", () => {
  const dialog = (locale: "tr" | "en" | "ar") =>
    (
      resources[locale].nizam as unknown as Record<
        string,
        Record<string, unknown>
      >
    ).PassivateScopeDialog;

  it("has a sentence for every line the screen can draw, in all three languages", () => {
    const keys = impactLines(impact(), "KOSK")
      .concat(impactLines(impact(), "MADRASAH"))
      .concat(impactLines(impact({ staffLeaving: 0 }), "KOSK"))
      .concat(impactLines(impact({ closesContent: false }), "KOSK"))
      .concat(
        impactLines(
          impact({ sessions: { windowDays: 7, count: 0, next: [] } }),
          "KOSK"
        )
      )
      .map((l) => l.key);
    for (const locale of ["tr", "en", "ar"] as const) {
      for (const key of keys) {
        expect(dialog(locale)?.[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it("has an errors.* sentence for every key passivationErrorKey can answer", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const errors = dialog(locale)?.errors as Record<string, string>;
      for (const code of [
        "PASSIVATION_IMPACT_CHANGED",
        "KOSK_ALREADY_PASSIVE",
        "MADRASAH_NOT_FOUND",
        "AUTHZ_FORBIDDEN",
        "OTHER",
      ]) {
        const key = passivationErrorKey({ code }).replace("errors.", "");
        expect(errors[key], `${locale}.errors.${key}`).toBeTruthy();
      }
    }
  });
});
