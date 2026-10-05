import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  courseMeta,
  DESCRIPTION_MAX,
  descriptionTooLong,
  formValid,
  medresePageUrl,
  NAME_MAX,
  nameProblem,
  POLICY_ICONS,
  POLICY_KEYS,
  POLICY_TIERS,
  type SettingsForm,
  saveFailedKey,
  settingsPatch,
  snapshotOf,
} from "~/features/settings/settings";

const saved: SettingsForm = {
  name: "Süleymaniye Medresesi",
  description: "Klasik medrese müfredatını çevrim içi sürdürür.",
  policies: {
    closedCourseRequired: false,
    alwaysApproval: true,
    noPublicRecordings: false,
  },
};

const settings = (over: Record<string, unknown> = {}) =>
  ({
    name: "Süleymaniye Medresesi",
    description: null,
    policies: {
      closedCourseRequired: false,
      alwaysApproval: false,
      noPublicRecordings: false,
    },
    updatedAt: null,
    updatedBy: null,
    ...over,
  }) as never;

describe("the medrese name (nazir 04, criterion 1)", () => {
  it("is refused when it is blank, even if it holds only spaces", () => {
    expect(nameProblem("")).toBe("required");
    expect(nameProblem("   ")).toBe("required");
  });

  it("is refused under two characters and over 120, counted trimmed as the API counts", () => {
    expect(nameProblem("A")).toBe("short");
    expect(nameProblem(" A ")).toBe("short");
    expect(nameProblem("Aa")).toBeNull();
    expect(nameProblem("a".repeat(NAME_MAX))).toBeNull();
    expect(nameProblem("a".repeat(NAME_MAX + 1))).toBe("long");
    expect(nameProblem(` ${"a".repeat(NAME_MAX)} `)).toBeNull();
  });

  it("keeps a form from being sent when the name or the description is wrong", () => {
    expect(formValid(saved)).toBe(true);
    expect(formValid({ ...saved, name: " " })).toBe(false);
    expect(
      formValid({ ...saved, description: "a".repeat(DESCRIPTION_MAX + 1) })
    ).toBe(false);
    expect(descriptionTooLong("a".repeat(DESCRIPTION_MAX))).toBe(false);
  });
});

describe("what Kaydet sends", () => {
  it("is nothing while nothing differs, whitespace aside", () => {
    expect(settingsPatch(saved, saved)).toBeNull();
    expect(
      settingsPatch(saved, {
        ...saved,
        name: `  ${saved.name} `,
        description: ` ${saved.description}`,
      })
    ).toBeNull();
  });

  it("is only the fields that changed, trimmed", () => {
    expect(
      settingsPatch(saved, { ...saved, name: "  Fatih Medresesi " })
    ).toEqual({ name: "Fatih Medresesi" });
    expect(
      settingsPatch(saved, { ...saved, description: "Yeni açıklama " })
    ).toEqual({ description: "Yeni açıklama" });
  });

  it("clears a description with null, and sends nothing when there was none to clear", () => {
    expect(settingsPatch(saved, { ...saved, description: "  " })).toEqual({
      description: null,
    });
    const bare = { ...saved, description: "" };
    expect(settingsPatch(bare, { ...bare, description: "   " })).toBeNull();
  });

  it("is only the policies that were switched, never the ones that were not", () => {
    expect(
      settingsPatch(saved, {
        ...saved,
        policies: { ...saved.policies, noPublicRecordings: true },
      })
    ).toEqual({ policies: { noPublicRecordings: true } });
    expect(
      settingsPatch(saved, {
        ...saved,
        policies: {
          closedCourseRequired: true,
          alwaysApproval: false,
          noPublicRecordings: false,
        },
      })
    ).toEqual({
      policies: { closedCourseRequired: true, alwaysApproval: false },
    });
  });

  it("carries a name, a description and policies together", () => {
    expect(
      settingsPatch(saved, {
        name: "Fatih",
        description: "",
        policies: { ...saved.policies, alwaysApproval: false },
      })
    ).toEqual({
      name: "Fatih",
      description: null,
      policies: { alwaysApproval: false },
    });
  });
});

describe("the state the API holds", () => {
  it("reads every policy off, no description and no last change before the first save", () => {
    expect(snapshotOf(settings())).toEqual({
      form: {
        name: "Süleymaniye Medresesi",
        description: "",
        policies: {
          closedCourseRequired: false,
          alwaysApproval: false,
          noPublicRecordings: false,
        },
      },
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("names who saved last, by name, else by address", () => {
    const at = new Date("2026-09-29T09:00:00Z");
    expect(
      snapshotOf(
        settings({
          updatedAt: at,
          updatedBy: {
            id: "u",
            name: "Mehmet Emin Işıkoğlu",
            email: "m@x.test",
          },
        })
      )
    ).toMatchObject({
      updatedAt: "2026-09-29T09:00:00.000Z",
      updatedBy: "Mehmet Emin Işıkoğlu",
    });
    expect(
      snapshotOf(
        settings({
          updatedAt: at,
          updatedBy: { id: "u", name: null, email: "m@x.test" },
        })
      ).updatedBy
    ).toBe("m@x.test");
  });
});

describe("a refused save", () => {
  it("is worded from the API's code, not from its message", () => {
    expect(saveFailedKey("VALIDATION_ERROR")).toBe(
      "Settings.saveFailedInvalid"
    );
    expect(saveFailedKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(saveFailedKey("")).toBe("Problems.actionGeneric");
    expect(saveFailedKey("SOMETHING_NEW")).toBe("Problems.actionGeneric");
  });
});

describe("the policy tiers panel (criterion 5)", () => {
  it("lists the four levels in order, the medrese's third", () => {
    expect(POLICY_TIERS.map((tier) => tier.id)).toEqual([
      "medaris",
      "kosk",
      "medrese",
      "ders",
    ]);
  });
});

describe("the courses a policy applies to", () => {
  const words = { imam: "imam", locale: "tr" };

  it("names the köşk, then the müderrisler with the imam marked", () => {
    expect(
      courseMeta(
        {
          koskName: "Nûruosmaniye Köşkü",
          muderris: [
            {
              name: "Mehmet Emin Işıkoğlu",
              title: null,
              isImam: true,
              userId: null,
              email: null,
            },
            {
              name: "Abdülhamit Karaosmanoğlu",
              title: null,
              isImam: false,
              userId: null,
              email: null,
            },
          ],
        },
        words
      )
    ).toBe(
      "Nûruosmaniye Köşkü · Mehmet Emin Işıkoğlu, imam ve Abdülhamit Karaosmanoğlu"
    );
  });

  it("lists three müderrisler as a series and leaves a missing team out", () => {
    expect(
      courseMeta(
        {
          koskName: "Fatih Köşkü",
          muderris: ["A B", "C D", "E F"].map((name) => ({
            name,
            title: null,
            isImam: false,
            userId: null,
            email: null,
          })),
        },
        words
      )
    ).toBe("Fatih Köşkü · A B, C D ve E F");
    expect(courseMeta({ koskName: "Fatih Köşkü", muderris: [] }, words)).toBe(
      "Fatih Köşkü"
    );
  });
});

describe("the link to the medrese's page", () => {
  it("is Tedris's Turkish medrese page, and absent when Tedris's address is not set", () => {
    expect(medresePageUrl("http://localhost:4000", "abc-1")).toBe(
      "http://localhost:4000/tr/madrasahs/abc-1"
    );
    expect(medresePageUrl("https://tedris.example/", "a/b")).toBe(
      "https://tedris.example/tr/madrasahs/a%2Fb"
    );
    expect(medresePageUrl("", "abc")).toBeNull();
    expect(medresePageUrl(undefined, "abc")).toBeNull();
  });
});

describe("message keys of the settings screen", () => {
  for (const locale of ["tr", "en", "ar"] as const) {
    it(`${locale} has a label and a help line for every policy and a word for every problem built at run time`, () => {
      const m = resources[locale].nazir as unknown as {
        Settings: {
          policies: Record<string, { label: string; help: string }>;
          nameProblems: Record<string, string>;
          tiers: Record<string, { name?: string; help: string }>;
          status: Record<string, string>;
        };
        Problems: Record<string, string>;
      };
      for (const key of POLICY_KEYS) {
        expect(
          m.Settings.policies[key]?.label,
          `${locale} ${key}`
        ).toBeTruthy();
        expect(m.Settings.policies[key]?.help, `${locale} ${key}`).toBeTruthy();
        expect(POLICY_ICONS[key]).toBeTruthy();
      }
      for (const problem of ["required", "short", "long"]) {
        expect(m.Settings.nameProblems[problem], problem).toBeTruthy();
      }
      for (const tier of POLICY_TIERS) {
        expect(m.Settings.tiers[tier.id]?.help, tier.id).toBeTruthy();
        if (tier.id !== "medrese") {
          expect(m.Settings.tiers[tier.id]?.name, tier.id).toBeTruthy();
        }
      }
      for (const status of ["PUBLISHED", "DRAFT"]) {
        expect(m.Settings.status[status], status).toBeTruthy();
      }
      for (const code of ["VALIDATION_ERROR", "AUTHZ_FORBIDDEN", ""]) {
        const [namespace, key] = saveFailedKey(code).split(".") as [
          "Settings" | "Problems",
          string,
        ];
        expect(
          (m[namespace] as unknown as Record<string, string>)[key],
          `${locale} ${code}`
        ).toBeTruthy();
      }
    });
  }
});
