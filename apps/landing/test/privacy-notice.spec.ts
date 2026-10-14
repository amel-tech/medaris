import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
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

// The controller's former placeholders (MDRS-102). The owner removed the
// title, address, KEP and MERSİS for now (4 October); none may come back as
// a bracketed placeholder.
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
      "Kimlik: adınız, soyadınız ve cinsiyetiniz",
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

  it("says where uploaded course and homework files are kept (owner, 12 October)", () => {
    expect(text).toContain("ödev dosyaları");
    expect(text).toContain(
      "Bunny Storage’ın (BunnyWay d.o.o., Slovenya) Almanya’nın Frankfurt kentindeki"
    );
    expect(text).toContain("yalnız siz ve ders kadrosu görür");
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

const sectionText = (id: string) => {
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) throw new Error(`no section ${id}`);
  return [
    ...(section.paragraphs ?? []),
    ...(section.items ?? []),
    section.closing ?? "",
  ].join(" ");
};

describe("gender (owner, 13 October)", () => {
  it("gives the owner's two reasons among the purposes", () => {
    const purposes = sectionText("amaclar");
    expect(purposes).toContain(
      "yüz yüze derslerde kadın ve erkek kontenjanlarının ayrı ayrı sayılması"
    );
    expect(purposes).toContain(
      "ihtiyaç duyan medrese ve köşklerin, hangi talebeyle kadrolarından kimin iletişim kuracağını bilebilmesi"
    );
  });

  it("says where it is kept, who sees it and how it is collected", () => {
    expect(sectionText("islenen-veriler")).toContain(
      "Cinsiyetiniz kimlik sunucusundaki hesabınızda tutulur"
    );
    const recipients = sectionText("aktarim");
    expect(recipients).toContain(
      "adınız, soyadınız, cinsiyetiniz, kullanıcı adınız, e-posta adresiniz"
    );
    expect(recipients).toContain(
      "Ders, medrese ve köşk kadroları: cinsiyetinizi"
    );
    expect(sectionText("yontem-ve-hukuki-sebep")).toContain(
      "Cinsiyetinizi hesap açarken kayıt formunda seçersiniz; daha önce açılmış hesaplardan bir sonraki girişte bir kez istenir."
    );
  });

  it("names a legal basis for it and tells how to correct it", () => {
    expect(sectionText("yontem-ve-hukuki-sebep")).toMatch(
      /Cinsiyetiniz, yüz yüze derslerin kontenjanı için \(c\) bendine; iletişim kuracak kişinin belirlenmesi için \(f\) bendine/
    );
    expect(sectionText("haklariniz")).toContain(
      "Adınızı, soyadınızı ve cinsiyetinizi hesabınızdan kendiniz de düzeltebilirsiniz."
    );
  });

  // The owner, 14 October: the public profile does not show it; whether it
  // will is decided when the profile is turned back on.
  it("is not shown on the public profile, nor to anyone but those staff", () => {
    expect(sectionText("amaclar")).toContain(
      "Cinsiyetiniz herkese açık profilinizde gösterilmez ve Medaris’te ders kadrosu ile buna ihtiyaç duyan medrese ve köşk kadrolarından başkası onu görmez."
    );
    expect(text).not.toContain("herkese açık profilinizde de gösterilir");
    expect(sectionText("yontem-ve-hukuki-sebep")).not.toContain(
      "herkese açık profilinizde gösterilmesi"
    );
  });
});

describe("partner applications, “Medaris ile giriş yap” (owner, 13 and 14 October)", () => {
  it("receive only the name, e-mail and gender, and only after the consent screen", () => {
    const recipients = sectionText("aktarim");
    expect(recipients).toContain("“Medaris ile giriş yap” seçeneği sunar");
    expect(recipients).toContain(
      "Bu ekranda izin verirseniz o uygulamaya yalnızca adınız, soyadınız, e-posta adresiniz (doğrulanıp doğrulanmadığıyla birlikte) ve cinsiyetiniz, sizi tanıması için hesap kimliğinizle birlikte iletilir."
    );
    expect(recipients).toContain(
      "İzin vermezseniz uygulamaya hiçbir bilgi iletilmez."
    );
    expect(sectionText("amaclar")).toContain(
      "izin verdiğiniz bilgilerin bu uygulamalara iletilmesi"
    );
  });

  it("never receive the user name or the language", () => {
    expect(sectionText("aktarim")).toContain(
      "Kullanıcı adınız ve dil tercihiniz hiçbir ortak uygulamaya iletilmez."
    );
  });

  it("rest on explicit consent, which the person withdraws under Tedris → Hesap → Bağlı uygulamalar", () => {
    expect(sectionText("yontem-ve-hukuki-sebep")).toContain(
      "Ortak uygulamalara aktarım ise yalnız onay ekranında verdiğiniz açık rızaya dayanır"
    );
    expect(sectionText("haklariniz")).toContain(
      "Bir ortak uygulamaya verdiğiniz izni, Tedris’te Hesap sayfanızdaki “Bağlı uygulamalar” bağlantısından ya da 7. bölümdeki yolla başvurarak dilediğiniz zaman geri alabilirsiniz; bundan sonra o uygulamaya yeni bilgi iletilmez."
    );
    expect(sectionText("islenen-veriler")).toContain(
      "ortak uygulamalara verdiğiniz izinler"
    );
  });

  // Rather than a list of names: the page may name no domain but Medaris's
  // own, so no partner's address reaches it.
  it("are not named: no domain on the page but medaris.app", () => {
    const domains =
      text.match(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi) ?? [];
    expect(domains).toContain("medaris.app");
    expect(domains.filter((d) => !/(^|\.)medaris\.app$/i.test(d))).toEqual([]);
  });
});

describe("the controller (MDRS-102)", () => {
  it("is named by its e-mail address, selam@medaris.app, on the page", () => {
    expect(CONTROLLER).toEqual({ email: "selam@medaris.app" });
    expect(text).toContain("E-posta: selam@medaris.app");
    expect(text).toContain("adresinizden selam@medaris.app adresine");
  });

  it("leaves no bracketed placeholder on the page or in the workspace's source", () => {
    expect(text).not.toMatch(/\[[^\]]+\]/);
    const elsewhere = ["apps", "libs", "config"]
      .flatMap((dir) => sourceFiles(join(REPO, dir)))
      .filter((file) => !file.endsWith("privacy-notice.spec.ts"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return PLACEHOLDERS.some((p) => source.includes(p));
      })
      .map((file) => relative(REPO, file));
    expect(elsewhere).toEqual([]);
  });
});

describe("the draft note (owner, 4 October)", () => {
  it("shows in development and never in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { IS_DRAFT } = await import("../content/aydinlatma-metni");
    expect(IS_DRAFT).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const dev = await import("../content/aydinlatma-metni");
    expect(dev.IS_DRAFT).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("landing's footer (MDRS-102)", () => {
  it("links to the notice", () => {
    expect(footerLinks.map((link) => link.href)).toContain(PRIVACY_NOTICE_PATH);
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
