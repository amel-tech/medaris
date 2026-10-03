import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { resources } from "@medaris/i18n";
import { PRIVACY_NOTICE_PATH, PRIVACY_NOTICE_URL } from "@medaris/utils";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PrivacyNoticeLayout from "../app/aydinlatma-metni/layout";
import PrivacyNoticePage from "../app/aydinlatma-metni/page";
import { footerLinks } from "../components/site-footer";
import {
  ACCOUNT_RECORD_FIELDS,
  CONTROLLER,
  SECTIONS,
  TITLE,
} from "../content/aydinlatma-metni";
import { config } from "../middleware";

// next/font is compiled by Next; outside it, the layout only needs names.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "font", variable: "font-variable" });
  return { Inter: font, Playfair_Display: font };
});

const LANDING = join(__dirname, "..");
const REPO = join(LANDING, "..", "..");
const CONTENT_FILE = join(LANDING, "content", "aydinlatma-metni.ts");

const PLACEHOLDERS = [
  "[Veri sorumlusu unvanı]",
  "[Adres]",
  "[E-posta]",
  "[KEP adresi]",
  "[MERSİS no]",
];

const html = renderToStaticMarkup(createElement(PrivacyNoticePage));
/** The page as a visitor reads it: tags dropped, entities decoded. */
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

/** Source files of the workspace, without dependencies and build output. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      [
        "node_modules",
        ".next",
        "dist",
        "dist_keycloak",
        "coverage",
        ".tsbuild",
        ".turbo",
      ].includes(entry.name)
    ) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(tsx?|jsx?|json|ftl|properties|sh)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe("the privacy notice page (MDRS-102)", () => {
  it("is published under the path the apps link to", () => {
    expect(
      existsSync(join(LANDING, "app", PRIVACY_NOTICE_PATH, "page.tsx"))
    ).toBe(true);
    expect(new URL(PRIVACY_NOTICE_URL).pathname).toBe(PRIVACY_NOTICE_PATH);
  });

  it("is outside the locale middleware, so it is served as is to anyone", () => {
    const [matcher] = config.matcher;
    const matches = (path: string) => new RegExp(`^${matcher}$`).test(path);
    expect(matches(PRIVACY_NOTICE_PATH)).toBe(false);
    // The check can fail: ordinary pages still go through next-intl.
    expect(matches("/")).toBe(true);
    expect(matches("/tr")).toBe(true);
    expect(matches(`${PRIVACY_NOTICE_PATH}-eski`)).toBe(true);
  });

  it("renders in Turkish", () => {
    const layout = renderToStaticMarkup(
      createElement(PrivacyNoticeLayout, null, "x")
    );
    expect(layout).toMatch(/^<html lang="tr"/);
    expect(text).toContain(TITLE);
    expect(text).toContain("Kişisel Verilerin Korunması Kanunu");
    expect(text).not.toMatch(/\b(the|and|privacy|data)\b/i);
  });

  it.each([
    ["the data controller", "Veri sorumlusu"],
    ["the data processed", "İşlenen kişisel veriler"],
    ["the purposes", "İşleme amaçları"],
    ["transfers", "aktarılması"],
    [
      "the collection method and legal basis",
      "Toplama yöntemi ve hukuki sebep",
    ],
    ["the rights under Article 11", "11. maddesi"],
    ["how to apply", "Başvuru"],
  ])("covers %s", (_, heading) => {
    expect(SECTIONS.some((s) => s.heading.includes(heading))).toBe(true);
    expect(text).toContain(heading);
  });

  it("names the data categories and the recipients the issue lists", () => {
    for (const phrase of [
      "Kimlik: adınız ve soyadınız",
      "İletişim: e-posta adresiniz",
      "Hesap ve kullanım verileri",
      "Eğitim kayıtları",
      "Kimlik doğrulama sunucusu",
      "Barındırma hizmeti",
      "YouTube",
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("lists every column tedrisat keeps about a user (MDRS-104)", () => {
    const schema = readFileSync(
      join(REPO, "apps/tedrisat/src/database/schema/user.schema.ts"),
      "utf8"
    );
    const columns = [
      ...schema.matchAll(/\b(?:uuid|text|boolean|timestamp)\("([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect(columns.length).toBeGreaterThan(0);
    expect(Object.keys(ACCOUNT_RECORD_FIELDS).sort()).toEqual(
      [...columns].sort()
    );
    for (const words of Object.values(ACCOUNT_RECORD_FIELDS)) {
      expect(text).toContain(words);
    }
  });
});

describe("the controller placeholders (MDRS-102)", () => {
  it("are all in CONTROLLER, and all on the page", () => {
    expect(Object.values(CONTROLLER).sort()).toEqual([...PLACEHOLDERS].sort());
    for (const placeholder of PLACEHOLDERS) {
      expect(text).toContain(placeholder);
    }
  });

  it("are each written exactly once, in the content file, and nowhere else", () => {
    const content = readFileSync(CONTENT_FILE, "utf8");
    for (const placeholder of PLACEHOLDERS) {
      expect(content.split(placeholder).length - 1, placeholder).toBe(1);
    }

    const elsewhere = ["apps", "libs", "config"]
      .flatMap((dir) => sourceFiles(join(REPO, dir)))
      .filter((file) => file !== CONTENT_FILE)
      .filter((file) => !file.endsWith("privacy-notice.spec.ts"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return PLACEHOLDERS.some((p) => source.includes(p));
      })
      .map((file) => relative(REPO, file));
    expect(elsewhere).toEqual([]);
  });
});

describe("landing's footer (MDRS-102)", () => {
  it("links to the notice", () => {
    expect(footerLinks.map((link) => link.href)).toContain(PRIVACY_NOTICE_PATH);
  });

  it.each(["tr", "en", "ar"] as const)("labels the link in %s", (lang) => {
    expect(resources[lang].landing.footer.privacyNotice).toMatch(/\p{L}/u);
  });
});

describe("the registration form's link (MDRS-102)", () => {
  it("points at the same URL", () => {
    const profile = JSON.parse(
      readFileSync(join(REPO, "config/keycloak/user-profile.json"), "utf8")
    ) as {
      attributes: { name: string; annotations?: Record<string, string> }[];
    };
    const attribute = profile.attributes.find(
      (a) => a.name === "privacyNoticeRead"
    );
    expect(attribute?.annotations?.linkUrl).toBe(PRIVACY_NOTICE_URL);
  });
});
