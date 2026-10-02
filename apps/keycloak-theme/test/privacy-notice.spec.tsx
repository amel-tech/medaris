/**
 * @vitest-environment happy-dom
 *
 * MDRS-102: the "Aydınlatma Metni’ni okudum." box on the registration form.
 * Keycloak enforces it (the attribute is required in the realm's user
 * profile — tedrisat's keycloak-provision e2e spec posts the form without it);
 * this spec covers what the theme adds: the box is shown, labelled in each
 * language, and its link opens the notice in a new tab.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { privacyNoticeReadAttribute } from "../src/login/KcPageStory";
import { type RenderedPage, renderPage } from "./render-page";

const PROFILE = JSON.parse(
  readFileSync(
    join(__dirname, "../../../config/keycloak/user-profile.json"),
    "utf8"
  )
) as {
  attributes: {
    name: string;
    displayName: string;
    validations: Record<string, unknown>;
    annotations: Record<string, unknown>;
    required?: { roles: string[] };
  }[];
};

const declared = PROFILE.attributes.find(
  (attribute) => attribute.name === "privacyNoticeRead"
);

let page: RenderedPage | undefined;

beforeAll(async () => {
  await import("keycloakify/login/i18n/messages_defaultSet/tr");
  await import("keycloakify/login/i18n/messages_defaultSet/ar");
});

afterEach(() => {
  page?.unmount();
  page = undefined;
});

/** The posted input (Base UI keeps the id there) and the control a person sees. */
const input = () =>
  document.querySelector<HTMLInputElement>("input#privacyNoticeRead-yes") ??
  undefined;
const label = () => input()?.closest("label") ?? null;
const box = () =>
  label()?.querySelector<HTMLElement>('[role="checkbox"]') ?? undefined;

describe("the privacy notice box (MDRS-102)", () => {
  it("is declared in the realm's user profile the way the theme renders it", () => {
    expect(declared).toBeDefined();
    expect(declared?.required?.roles).toContain("user");
    expect(declared?.displayName).toBe(privacyNoticeReadAttribute.displayName);
    expect(declared?.validations).toEqual(
      privacyNoticeReadAttribute.validators
    );
    expect(declared?.annotations).toEqual(
      privacyNoticeReadAttribute.annotations
    );
  });

  it.each([
    ["tr", "Aydınlatma Metni’ni okudum.", "Aydınlatma Metni"],
    ["en", "I have read the Privacy Notice.", "Privacy Notice"],
    ["ar", "لقد قرأت إشعار الخصوصية.", "إشعار الخصوصية"],
  ])("is a required checkbox on the registration form (%s)", async (languageTag, text, linkText) => {
    page = await renderPage("register.ftl", languageTag);

    const checkbox = box();
    expect(checkbox, "checkbox").toBeDefined();
    expect(checkbox?.getAttribute("role")).toBe("checkbox");
    expect(checkbox?.getAttribute("aria-checked")).toBe("false");
    expect(input()?.name).toBe("privacyNoticeRead");
    expect(input()?.value).toBe("yes");
    expect(checkbox?.closest("form")?.id).toBe("kc-register-form");
    // the label is the text, the link inside it, and the decorative asterisk
    expect(label()?.textContent).toBe(`${text}*`);

    const link = label()?.querySelector("a");
    expect(link?.textContent).toBe(linkText);
    expect(link?.getAttribute("href")).toBe(declared?.annotations.linkUrl);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");

    // Required: the box says so and the link says it opens elsewhere.
    expect(checkbox?.getAttribute("aria-required")).toBe("true");
    const note = document.getElementById(
      link?.getAttribute("aria-describedby") ?? ""
    );
    expect(note?.textContent?.length).toBeGreaterThan(0);
  });

  it("shows no link, but the same words, for a linkUrl that is not http(s)", async () => {
    page = await renderPage("register.ftl", "tr", {
      profile: {
        attributesByName: {
          privacyNoticeRead: {
            annotations: { linkUrl: "javascript:alert(1)" },
          },
        },
      },
    } as never);

    expect(label()?.querySelector("a")).toBeNull();
    // The link text still stands in for {0}; the placeholder never shows.
    expect(label()?.textContent).toBe("Aydınlatma Metni’ni okudum.*");
  });
});
