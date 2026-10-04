import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "../app/[locale]/page";
import { GET } from "../app/tedris/[[...path]]/route";
import * as karsilama from "../content/karsilama";
import { exploreHref, registerHref, signInHref } from "../lib/tedris";

vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));

const LANDING = join(__dirname, "..");

const renderHome = async () =>
  (await Home({ params: Promise.resolve({ locale: "tr" }) })) as ReactElement;

// Components that need React's runtime (a hook) and carry no link: left unexpanded.
const OPAQUE = new Set(["Logo", "ThemeToggle"]);

/** Every element of the page's tree, with the page's own function components expanded. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  let rendered = (node.props as { children?: ReactNode }).children;
  if (typeof node.type === "function" && !OPAQUE.has(node.type.name)) {
    rendered = (node.type as (props: unknown) => ReactNode)(node.props);
  }
  return [node, ...elements(rendered)];
}

const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const DONATION = /bağış|bağis|bagis|donat|fundrais|destek\s*ol|ücret|bedava/i;

describe("the home page's calls to action (MDRS-245)", () => {
  it.each([
    ["Kayıt ol", registerHref],
    ["Giriş yap", signInHref],
  ])("%s is a plain anchor to %s, never a next/link", async (_name, href) => {
    const links = elements(await renderHome()).filter(
      (el) => el.props.href === href
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.type).toBe("a");
    }
  });

  it("renders them with the exact hrefs of lib/tedris.ts", async () => {
    const html = renderToStaticMarkup(await renderHome());
    expect(registerHref).toBe("/api/tedris/register?locale=tr");
    expect(signInHref).toBe("/api/tedris/signin?locale=tr");
    expect(html).toContain(`href="${registerHref}"`);
    expect(html).toContain(`href="${signInHref}"`);
  });

  it("sends Keşfet to a page tedris opens to a visitor, per request", async () => {
    expect(exploreHref).toBe("/tedris/discover");
    const response = await GET(new Request("http://localhost:4003"), {
      params: Promise.resolve({ path: ["discover"] }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/tr/discover"
    );
  });
});

describe("what the home page says (MDRS-245)", () => {
  // The other content files are legal texts with their own issues: the
  // notice's statutory "free of charge" and the terms' fee placeholder are not
  // claims of this page.
  const contentFiles = ["karsilama.ts"];

  it("never mentions a donation, a fee or 'free', in the markup or the content", async () => {
    const text = textOf(renderToStaticMarkup(await renderHome()));
    expect(text).not.toMatch(DONATION);
    expect(text).not.toMatch(/ücretsiz|\bfree\b/i);
    for (const file of contentFiles) {
      const source = readFileSync(join(LANDING, "content", file), "utf8");
      expect(source).not.toMatch(DONATION);
      expect(source).not.toMatch(/ücretsiz|\bfree\b/i);
    }
  });

  // The reference is main together with the open pull requests (owner, 4
  // October): notes and questions (MDRS-150) and recordings (MDRS-116/119/247)
  // may be claimed; icâzet and certificates may not (SPEC-D3-09).
  it("claims no icâzet or certificate", async () => {
    const text = textOf(renderToStaticMarkup(await renderHome()));
    expect(text).not.toMatch(/icâzet|icazet|sertifika|katılım belgesi/i);
  });

  it("keeps the notes private and gives the recordings their closed-course rule", async () => {
    const text = textOf(renderToStaticMarkup(await renderHome()));
    expect(text).toContain("notlarınızı sizden başkası görmez");
    expect(text).toContain(
      "kapalı derslerin kayıtları hiçbir zaman herkese açılmaz"
    );
  });

  it("does not put köşks under a medrese: köşks hold courses, medreses open them there", async () => {
    const text = textOf(renderToStaticMarkup(await renderHome()));
    expect(text).not.toMatch(
      /üstekinin içinde|çatı altında|bağlı olmak zorunda/i
    );
  });

  it("does not say that course content is closed to a visitor", async () => {
    const text = textOf(renderToStaticMarkup(await renderHome()));
    expect(text).not.toMatch(
      /ders içeriği|içerik[^.]*(kilitli|görünür)|içeriği kayıtlı/i
    );
  });

  it("does not promise a meeting link or a live stream on every celse, or name the müderris alone for the stream", async () => {
    const text = textOf(renderToStaticMarkup(await renderHome()));
    expect(text).not.toMatch(/kendi toplantı bağlantısı/i);
    expect(text).not.toMatch(/müderris canlı yayın/i);
    expect(text).toContain(
      "celse sürerken yayın ve altında canlı sohbet açılır"
    );
  });

  it("speaks to both talebe and medreses, and sends a medrese to the contact form", async () => {
    const html = renderToStaticMarkup(await renderHome());
    expect(html).toContain('id="talebeler"');
    expect(html).toContain('id="medreseler"');
    expect(html).toContain('href="#medreseler"');
    expect(html).toContain('href="/iletisim"');
    expect(textOf(html)).toContain("Medreseleri Medaris yönetimi açar");
    expect(textOf(html)).not.toMatch(/size dönelim|cevap verilir/);
  });

  it("sets the Qur'an only in the Qur'an face, with its end mark bound to the word before it", async () => {
    const html = renderToStaticMarkup(await renderHome());
    expect(html).toMatch(/<p class="mds-quran[^"]*" lang="ar" dir="rtl">/);
    expect(karsilama.folio.ayah).toContain("\u00a0﴿");
  });

  it("keeps 'who runs Medaris' out while any of its fields is a placeholder", async () => {
    expect(
      Object.values(karsilama.operator).some(karsilama.isPlaceholder)
    ).toBe(true);
    const html = renderToStaticMarkup(await renderHome());
    expect(html).not.toContain(karsilama.operator.title);
    expect(textOf(html)).not.toContain("[");
  });

  it("sets every Arabic run in an element that carries lang and dir itself", async () => {
    const html = renderToStaticMarkup(await renderHome());
    const arabic = /[؀-ۿ]+/g;
    const runs = [...html.matchAll(/<([a-z0-9]+)([^>]*)>([^<]*)</g)].filter(
      (m) => arabic.test(m[3] ?? "")
    );
    expect(runs.length).toBeGreaterThan(0);
    for (const [, , attrs] of runs) {
      expect(attrs).toContain('lang="ar"');
      expect(attrs).toContain('dir="rtl"');
    }
  });

  it("reads no environment while rendering and uses no NEXT_PUBLIC_ variable", () => {
    const source = readFileSync(
      join(LANDING, "app", "[locale]", "page.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/env|TEDRIS_APP_URL|NEXT_PUBLIC_/);
  });

  it("moves only on load, and only when motion is welcome", () => {
    const css = readFileSync(
      join(LANDING, "app", "[locale]", "karsilama.css"),
      "utf8"
    );
    const outside = css.replace(
      /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*\}\s*$/,
      ""
    );
    expect(outside).not.toMatch(/animation|transition|@keyframes/);
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
  });
});
