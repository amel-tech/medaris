/**
 * @vitest-environment happy-dom
 *
 * MDRS-100: every page a registrant can reach, rendered in all three
 * languages the product ships.
 *
 *   - no raw message key and no English left over on the Turkish and Arabic
 *     pages (AC 1) — checked by rendering the same page in English and
 *     requiring the two to share no copy;
 *   - each page is this theme's own, not keycloakify's DefaultPage with
 *     Keycloak's stock CSS on top, and each has Storybook stories in the
 *     three languages (AC 2);
 *   - the Arabic pages are right-to-left while e-mail, username and password
 *     fields stay left-to-right, and every field keeps its label (AC 4).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  contextStrings,
  isHidden,
  type PageId,
  type RenderedPage,
  renderPage,
  visibleStrings,
} from "./render-page";

/** In the order a new user meets them after "Kayıt ol". */
const REGISTRANT_PAGES: PageId[] = [
  "login.ftl",
  "register.ftl",
  "login-verify-email.ftl",
  "info.ftl",
  "login-update-profile.ftl",
  "terms.ftl",
  "login-reset-password.ftl",
  "login-update-password.ftl",
  "login-page-expired.ftl",
  "error.ftl",
  "logout-confirm.ftl",
];

/**
 * The wordmark in the logo: a name, not copy, so it is Latin on every page
 * (`lang="en"`, set in `Logo`) and the same in every language.
 */
const BRAND = new Set(["Medaris"]);

const LANGUAGES = ["tr", "en", "ar"] as const;

const LEFT_TO_RIGHT_FIELDS = [
  "username",
  "email",
  "password",
  "password-new",
  "password-confirm",
];

/** A message rendered by `msg()` whose text is still its own key. */
const rawKeys = () =>
  [...document.querySelectorAll("[data-kc-msg]")]
    .filter((element) => !isHidden(element))
    .filter(
      (element) =>
        element.textContent?.trim() === element.getAttribute("data-kc-msg")
    )
    .map((element) => element.getAttribute("data-kc-msg"));

/** camelCase or dotted words — what an unresolved message key looks like. */
const keyLikeWords = (strings: string[]) =>
  strings.flatMap(
    (s) =>
      s.match(/\b[a-z]+(?:[A-Z][a-z0-9]*)+\b|\b[a-z]+\.[A-Z_]{3,}\b/g) ?? []
  );

const stylesheetsFromKeycloak = () =>
  [...document.head.querySelectorAll("link[rel=stylesheet]")].map(
    (link) => link.getAttribute("href") ?? ""
  );

let page: RenderedPage | undefined;

beforeAll(async () => {
  // Warm the dynamic imports so a page settles in a few ticks.
  await import("keycloakify/login/i18n/messages_defaultSet/tr");
  await import("keycloakify/login/i18n/messages_defaultSet/ar");
});

afterEach(() => {
  page?.unmount();
  page = undefined;
  for (const link of document.head.querySelectorAll("link")) {
    link.remove();
  }
});

async function copyOf(pageId: PageId, languageTag: string) {
  page = await renderPage(pageId, languageTag);
  const strings = visibleStrings();
  const data = contextStrings(page.kcContext);
  page.unmount();
  page = undefined;
  return { strings, data };
}

describe.each(REGISTRANT_PAGES)("%s", (pageId) => {
  it.each(LANGUAGES)("shows no raw message key (%s)", async (languageTag) => {
    page = await renderPage(pageId, languageTag);
    expect(rawKeys()).toEqual([]);
    const data = contextStrings(page.kcContext);
    expect(keyLikeWords(visibleStrings().filter((s) => !data.has(s)))).toEqual(
      []
    );
  });

  it.each([
    "tr",
    "ar",
  ])("shares no copy with the English page (%s)", async (languageTag) => {
    const english = await copyOf(pageId, "en");
    const translated = await copyOf(pageId, languageTag);
    const leftovers = translated.strings.filter(
      (s) =>
        english.strings.includes(s) && !translated.data.has(s) && !BRAND.has(s)
    );
    expect(leftovers).toEqual([]);
  });

  it("has no Latin-script copy in Arabic", async () => {
    const { strings, data } = await copyOf(pageId, "ar");
    const latin = strings
      .filter((s) => !data.has(s) && !BRAND.has(s))
      .map((s) => [...data].reduce((rest, d) => rest.split(d).join(""), s))
      .filter((s) => /[A-Za-z]/.test(s));
    expect(latin).toEqual([]);
  });

  it("renders right-to-left in Arabic with intact fields", async () => {
    page = await renderPage(pageId, "ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");

    const inputs = [
      ...document.querySelectorAll<HTMLInputElement>("input, textarea"),
    ].filter((input) => input.type !== "hidden" && input.type !== "checkbox");
    for (const input of inputs) {
      expect(
        document.querySelector(`label[for="${input.id}"]`),
        `label for #${input.id}`
      ).not.toBeNull();
      if (LEFT_TO_RIGHT_FIELDS.includes(input.name)) {
        expect(input.getAttribute("dir"), input.name).toBe("ltr");
      }
    }
    for (const input of document.querySelectorAll<HTMLInputElement>(
      "input[type=password]"
    )) {
      const toggle = input.parentElement?.querySelector(
        `button[aria-controls="${input.id}"]`
      );
      expect(toggle, `show-password button for #${input.id}`).toBeTruthy();
    }
  });

  it("is this theme's page, without Keycloak's stock CSS", async () => {
    page = await renderPage(pageId, "tr");
    expect(stylesheetsFromKeycloak()).toEqual([]);
  });
});

describe("the checks themselves", () => {
  it("see Keycloak's stock CSS on a page this theme does not implement", async () => {
    page = await renderPage("login-otp.ftl", "tr");
    expect(stylesheetsFromKeycloak().join(" ")).toContain("patternfly");
  });

  it("see an unresolved key", async () => {
    page = await renderPage("info.ftl", "tr", {
      messageHeader: "someMissingKey",
    });
    expect(keyLikeWords(visibleStrings())).toContain("someMissingKey");
  });
});

describe("stories", () => {
  const modules = import.meta.glob<{
    default: { title: string };
    [story: string]: unknown;
  }>("../src/login/pages/*.stories.tsx", { eager: true });

  const byTitle = new Map(
    Object.values(modules).map((module) => [module.default.title, module])
  );

  it.each(
    REGISTRANT_PAGES
  )("%s has a story in Turkish, Arabic and English", (pageId) => {
    const module = byTitle.get(`login/${pageId}`);
    expect(module, `a stories file titled login/${pageId}`).toBeDefined();
    for (const story of ["DefaultTurkish", "DefaultArabic", "DefaultEnglish"]) {
      expect(module?.[story], story).toBeDefined();
    }
  });
});
