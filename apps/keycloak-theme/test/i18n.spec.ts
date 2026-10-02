/**
 * MDRS-100 AC 1, for the copy a page test cannot reach by rendering: the
 * field-validation messages that only appear after typing, and the messages
 * Keycloak itself renders server-side into `message.summary`. Plus the one
 * property of `src/login/i18n.ts` a type-check cannot see — that
 * `keycloakify build` can read it at all.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ar from "keycloakify/login/i18n/messages_defaultSet/ar";
import en from "keycloakify/login/i18n/messages_defaultSet/en";
import tr from "keycloakify/login/i18n/messages_defaultSet/tr";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../src/login");
const I18N_TS = readFileSync(join(SRC, "i18n.ts"), "utf8");

/**
 * The object literal passed to `withCustomTranslations`, evaluated the way
 * `keycloakify build` evaluates it (keycloakify/bin, generateMessageProperties:
 * the argument's source, `eval`-ed on its own). If this throws, the build
 * prints a warning and writes Keycloak's message files without our copy.
 */
function customTranslations(): Record<string, Record<string, string>> {
  const start = I18N_TS.indexOf("withCustomTranslations(");
  expect(start).toBeGreaterThan(-1);
  let i = I18N_TS.indexOf("(", start) + 1;
  const from = i;
  let depth = 1;
  let quote: string | undefined;
  for (; depth > 0; i++) {
    const c = I18N_TS[i];
    if (quote !== undefined) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  return new Function(`return (${I18N_TS.slice(from, i - 1)});`)();
}

const custom = customTranslations();
const defaults: Record<string, Record<string, string>> = { en, tr, ar };

const message = (lang: string, key: string) =>
  custom[lang]?.[key] ?? defaults[lang]?.[key];

/** Every literal key a page of this theme passes to msg/msgStr/advancedMsg. */
function keysInSource(dir: string): string[] {
  const keys: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) keys.push(...keysInSource(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".stories.")) {
      const source = readFileSync(path, "utf8");
      for (const m of source.matchAll(
        /\b(?:msg|msgStr|advancedMsg|advancedMsgStr)\(\s*"([^"]+)"/g
      )) {
        keys.push(m[1] as string);
      }
    }
  }
  return keys;
}

/**
 * Shown after the user types — keycloakify's client-side validation
 * (login/lib/getUserProfileApi) — or put into `message.summary` by Keycloak
 * on the pages a registrant meets.
 */
const INTERACTION_KEYS = [
  "error-user-attribute-required",
  "error-invalid-length",
  "error-invalid-length-too-short",
  "error-invalid-length-too-long",
  "error-invalid-email",
  "error-pattern-no-match",
  "error-invalid-value",
  "error-username-invalid-character",
  "error-person-name-invalid-character",
  "error-invalid-multivalued-size",
  "error-number-out-of-range",
  "error-number-out-of-range-too-small",
  "error-number-out-of-range-too-big",
  "invalidEmailMessage",
  "invalidPasswordConfirmMessage",
  "invalidPasswordMinLengthMessage",
  "invalidPasswordMaxLengthMessage",
  "invalidPasswordMinDigitsMessage",
  "invalidPasswordMinLowerCaseCharsMessage",
  "invalidPasswordMinUpperCaseCharsMessage",
  "invalidPasswordMinSpecialCharsMessage",
  "invalidPasswordNotUsernameMessage",
  "invalidPasswordNotEmailMessage",
  "emailExistsMessage",
  "usernameExistsMessage",
  "invalidUserMessage",
  "emailSentMessage",
  "emailVerifiedMessage",
  "emailVerifiedAlreadyMessage",
  "accountUpdatedMessage",
  "confirmExecutionOfActions",
  "expiredActionMessage",
  "expiredCodeMessage",
  "loginTimeout",
  "cookieNotFoundMessage",
  "termsAcceptanceRequired",
  "requiredAction.VERIFY_EMAIL",
  "requiredAction.UPDATE_PASSWORD",
  "requiredAction.UPDATE_PROFILE",
  "requiredAction.TERMS_AND_CONDITIONS",
];

const KEYS = [
  ...new Set([
    ...keysInSource(SRC),
    ...Object.keys(custom.en ?? {}),
    ...INTERACTION_KEYS,
  ]),
].sort();

describe("the theme's copy", () => {
  it("is statically readable by keycloakify build, for tr, en and ar", () => {
    expect(Object.keys(custom).sort()).toEqual(["ar", "en", "tr"]);
  });

  it("lists the same keys in every language", () => {
    const en = Object.keys(custom.en ?? {}).sort();
    expect(Object.keys(custom.tr ?? {}).sort()).toEqual(en);
    expect(Object.keys(custom.ar ?? {}).sort()).toEqual(en);
  });

  it("covers the keys it is checked against", () => {
    // A guard on the guard: the scan must actually find the pages' keys.
    expect(KEYS).toEqual(
      expect.arrayContaining([
        "registerSubtitle",
        "loginAccountSubtitle",
        "emailVerifyResend",
        "updatePasswordTitle",
      ])
    );
  });

  it.each(KEYS)("%s exists in all three languages", (key) => {
    for (const lang of ["en", "tr", "ar"]) {
      expect(message(lang, key), `${lang}: ${key}`).toBeTruthy();
    }
  });

  it.each(KEYS)("%s is not English in tr or ar", (key) => {
    for (const lang of ["tr", "ar"]) {
      expect(message(lang, key), `${lang}: ${key}`).not.toBe(
        message("en", key)
      );
    }
  });

  it.each(KEYS)("%s is Arabic script in ar", (key) => {
    const withoutPlaceholders = (message("ar", key) ?? "").replace(
      /\{\d+\}|&[a-z]+;/g,
      ""
    );
    expect(withoutPlaceholders, key).not.toMatch(/[A-Za-z]/);
  });

  it("carries no ASCII apostrophe, which Keycloak's MessageFormat would eat", () => {
    for (const [lang, messages] of Object.entries(custom)) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value, `${lang}: ${key}`).not.toContain("'");
      }
    }
  });
});
