import { resources } from "@medaris/i18n";
import { authErrorMessageKey } from "@medaris/services/auth-client";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { banErrorKey } from "~/features/bans/bans";
import { offsiteErrorKey } from "~/features/offsite/offsite";
import { decisionErrorKey } from "~/features/pano/pano";

const locales = ["tr", "en", "ar"] as const;

/** Every leaf of a catalogue as a dotted path, so a missing nested key shows. */
const leafKeys = (node: unknown, prefix = ""): string[] =>
  node !== null && typeof node === "object"
    ? Object.entries(node).flatMap(([key, value]) =>
        leafKeys(value, prefix ? `${prefix}.${key}` : key)
      )
    : [prefix];

describe("the nazir message catalogue", () => {
  it("has the same keys in every locale", () => {
    const keys = leafKeys(resources.tr.nazir).sort();
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of locales) {
      expect(leafKeys(resources[locale].nazir).sort()).toEqual(keys);
    }
  });

  it("has no empty message", () => {
    for (const locale of locales) {
      for (const key of leafKeys(resources[locale].nazir)) {
        const value = key
          .split(".")
          .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)[part],
            resources[locale].nazir
          );
        expect(value, `${locale}.${key}`).toEqual(expect.any(String));
        expect((value as string).trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("has a message for every NextAuth error the sign-in pages can show", () => {
    // `authErrorMessageKey` builds the key at run time, so nothing else pins it.
    const codes = [
      "AccessDenied",
      "Configuration",
      "OAuthSignin",
      "OAuthCallback",
      "Callback",
      "Verification",
      "Default",
      "SomethingNew",
    ];
    for (const locale of locales) {
      for (const code of codes) {
        const auth = resources[locale].nazir.Auth as Record<string, string>;
        expect(auth[authErrorMessageKey(code)], `${locale} ${code}`).toEqual(
          expect.any(String)
        );
      }
    }
  });

  it("has a message for every key the Yasaklamalar, Talebeler, Pano and Medrese dışı ders talebi screens build at run time", () => {
    // Refusal codes, roles, scopes, states and the three reason dialogs build their keys from data.
    const refusals = [
      ...[
        "BAN_FORBIDDEN",
        "BAN_LIFT_FORBIDDEN",
        "BAN_ALREADY_LIFTED",
        "BAN_NOT_FOUND",
        "BAN_TARGET_INVALID",
        "BAN_NOT_ESCALATABLE",
        "BAN_PERMANENT_REQUEST_EXISTS",
        "BAN_PERMANENT_REQUEST_INVALID",
        "COURSE_NOT_FOUND",
        "VALIDATION_ERROR",
        "AUTHZ_FORBIDDEN",
        "SOMETHING_NEW",
      ].map(banErrorKey),
      ...["KOSK_NOT_FOUND", "VALIDATION_ERROR", "AUTHZ_FORBIDDEN", ""].map(
        offsiteErrorKey
      ),
      ...["ENROLLMENT_NOT_FOUND", "AUTHZ_FORBIDDEN", ""].map(decisionErrorKey),
    ];
    const reasons = ["lift", "escalate", "permanent"].flatMap((kind) =>
      [
        "title",
        "label",
        "help",
        "submit",
        "done",
        "doneBody",
        "failedTitle",
      ].map((word) => `Reasons.${kind}.${word}`)
    );
    const keys = [
      ...refusals,
      ...reasons,
      ...[
        "MEDARIS_NAZIM",
        "KOSK_NAZIM",
        "MEDRESE_BASMUDERRIS",
        "MEDRESE_NAZIR",
        "MUDERRIS",
        "DERS_NAZIR",
      ].map((role) => `Roles.${role}`),
      ...["COURSE", "MADRASAH"].map((scope) => `Bans.scope.${scope}`),
      ...["ACTIVE", "LIFTED"].flatMap((status) => [
        `Bans.tabs.${status}`,
        `Bans.caption.${status}`,
        `Bans.empty.${status}`,
      ]),
      ...["ENROLLED", "COMPLETED"].map(
        (status) => `Students.filters.status.${status}`
      ),
      ...["published", "draft", "hidden"].map(
        (state) => `Account.scopeBadge.${state}`
      ),
      ...["required", "long"].map((p) => `Offsite.reasonProblems.${p}`),
      ...["required", "short", "long"].map(
        (p) => `OpenCourse.nameProblems.${p}`
      ),
    ];
    for (const locale of locales) {
      for (const key of keys) {
        const value = key
          .split(".")
          .reduce<unknown>(
            (node, part) =>
              (node as Record<string, unknown> | undefined)?.[part],
            resources[locale].nazir
          );
        expect(value, `${locale} ${key}`).toEqual(expect.any(String));
      }
    }
  });

  it("formats every message of the Talebeler, Yasaklamalar, Pano and Medrese dışı ders talebi screens in every language", () => {
    // Plural syntax and placeholders are only read when a message is formatted: a typo in `en` or `ar` would show on screen.
    const values = {
      name: "Sümeyye Nur",
      nameGenitive: "Sümeyye Nur’un",
      course: "Bina ve İzhar Şerhi",
      title: "Bina ve İzhar Şerhi",
      kosk: "Fatih Köşkü",
      koskGenitive: "Fatih Köşkü’nün",
      role: "Müderris",
      count: 3,
      courses: 2,
      kosks: 1,
      sessions: 2,
      applications: 3,
      page: 1,
      pages: 5,
      total: 48,
      from: 1,
      to: 10,
      number: 2,
      min: 2,
      max: 200,
    };
    const sections = [
      "Students",
      "Bans",
      "BanDialog",
      "Reasons",
      "Offsite",
      "Pano",
    ] as const;
    for (const locale of locales) {
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages: { nazir: resources[locale].nazir },
        namespace: "nazir",
        onError: (error) => errors.push(`${locale}: ${error.message}`),
      }) as unknown as (key: string, values: object) => string;
      for (const section of sections) {
        for (const key of leafKeys(resources[locale].nazir[section], section)) {
          expect(t(key, values), `${locale} ${key}`).not.toMatch(/[{}]/);
        }
      }
      expect(errors).toEqual([]);
    }
  });
});
