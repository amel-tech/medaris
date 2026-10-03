import { resources } from "@medaris/i18n";
import { authErrorMessageKey } from "@medaris/services/auth-client";
import { describe, expect, it } from "vitest";

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
});
