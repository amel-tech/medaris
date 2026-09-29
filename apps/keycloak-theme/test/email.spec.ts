/**
 * MDRS-100 AC 3, statically: the e-mail theme is complete in every language
 * and its templates only ask for messages it defines. `email.e2e.spec.ts`
 * proves the same files through a real Keycloak.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_LANGUAGES, EMAIL_THEME_DIR, readMessages } from "./email-theme";

const templates = ["html", "text"].flatMap((kind) =>
  readdirSync(join(EMAIL_THEME_DIR, kind)).map((file) => ({
    path: `${kind}/${file}`,
    source: readFileSync(join(EMAIL_THEME_DIR, kind, file), "utf8"),
  }))
);

const placeholders = (value: string) =>
  [...value.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();

describe("e-mail theme", () => {
  it("is a native theme keycloakify will package, for en, tr and ar", () => {
    const properties = readFileSync(
      join(EMAIL_THEME_DIR, "theme.properties"),
      "utf8"
    );
    expect(properties).toMatch(/^parent=base$/m);
    expect(properties).toMatch(/^locales=en,tr,ar$/m);
  });

  it("overrides the verification and password-reset e-mails, HTML and text", () => {
    expect(templates.map((t) => t.path).sort()).toEqual([
      "html/email-verification.ftl",
      "html/medaris-layout.ftl",
      "html/password-reset.ftl",
      "text/email-verification.ftl",
      "text/password-reset.ftl",
    ]);
  });

  it("defines the same keys, with the same placeholders, in every language", () => {
    const en = readMessages("en");
    for (const lang of EMAIL_LANGUAGES) {
      const messages = readMessages(lang);
      expect(Object.keys(messages).sort(), lang).toEqual(
        Object.keys(en).sort()
      );
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim(), `${lang}: ${key}`).not.toBe("");
        expect(placeholders(value), `${lang}: ${key}`).toEqual(
          placeholders(en[key] ?? "")
        );
        // An ASCII apostrophe opens a quoted section in MessageFormat.
        expect(value, `${lang}: ${key}`).not.toContain("'");
      }
    }
  });

  it("is translated: no Turkish or Arabic message is the English one", () => {
    const en = readMessages("en");
    for (const lang of ["tr", "ar"]) {
      for (const [key, value] of Object.entries(readMessages(lang))) {
        if (key === "emailDirection") continue;
        expect(value, `${lang}: ${key}`).not.toBe(en[key]);
      }
    }
  });

  it("is right-to-left in Arabic only", () => {
    expect(readMessages("ar").emailDirection).toBe("rtl");
    expect(readMessages("tr").emailDirection).toBe("ltr");
    expect(readMessages("en").emailDirection).toBe("ltr");
    for (const lang of EMAIL_LANGUAGES) {
      expect(readMessages(lang).emailLanguage).toBe(lang);
    }
  });

  it("leaves base's template.ftl alone, which the inherited e-mails import", () => {
    // A child-theme template.ftl shadows base's for every e-mail this theme
    // does not override, and those call `emailLayout` without arguments.
    expect(templates.map((t) => t.path)).not.toContain("html/template.ftl");
    for (const { path, source } of templates.filter((t) =>
      t.path.startsWith("html/")
    )) {
      expect(source, path).not.toContain('"template.ftl"');
    }
  });

  it("uses only messages the theme defines", () => {
    const defined = Object.keys(readMessages("en"));
    for (const { path, source } of templates) {
      for (const m of source.matchAll(/msg\("([^"]+)"/g)) {
        expect(defined, `${path} → ${m[1]}`).toContain(m[1]);
      }
    }
  });

  it("puts the Arabic direction on the page and keeps the link left-to-right", () => {
    const layout = templates.find((t) => t.path === "html/medaris-layout.ftl");
    expect(layout?.source).toMatch(
      /<html [^>]*dir="\$\{msg\("emailDirection"\)\}"/
    );
    expect(layout?.source).toMatch(
      /<p dir="ltr"[^>]*><a href="\$\{buttonHref\}"/
    );
  });
});
