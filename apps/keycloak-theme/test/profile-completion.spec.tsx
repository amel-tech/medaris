/**
 * @vitest-environment happy-dom
 *
 * MDRS-257: the "Profilinizi tamamlayın" page a signed-in user meets when the
 * realm's user profile has a required attribute they lack (the privacy-notice
 * box, MDRS-102). Keycloak serves the page with its own field error on the
 * box, and the box must be able to clear it: ticking it enables "Gönder",
 * clearing it disables "Gönder" again.
 *
 * The context below is what the dev realm served on 5 October: the box is
 * single-valued (`multivalued: false`) but Keycloak adds the `multivalued`
 * validator `{ max: "1" }`, it has no value, and `messagesPerField` already
 * names it. Keycloakify then holds the box as a list that starts at `[""]`.
 */
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type RenderedPage, renderPage } from "./render-page";

const SERVER_ERROR = "Lütfen bu alanı doldurun.";

const servedByKeycloak = {
  profile: {
    attributesByName: {
      username: { value: "e2e-talebe" },
      email: { value: "e2e.talebe@gmail.com" },
      firstName: { value: "E2E" },
      lastName: { value: "Talebe" },
      privacyNoticeRead: {
        value: "",
        values: [],
        validators: {
          options: { options: ["yes"], "ignore.empty.value": true },
          multivalued: { max: "1" },
        },
      },
    },
  },
  messagesPerField: {
    get: (field: string) => (field === "privacyNoticeRead" ? SERVER_ERROR : ""),
    exists: (field: string) => field === "privacyNoticeRead",
    existsError: (field: string) => field === "privacyNoticeRead",
    printIfExists: () => undefined,
  },
};

let page: RenderedPage | undefined;

beforeAll(async () => {
  await import("keycloakify/login/i18n/messages_defaultSet/tr");
});

afterEach(() => {
  page?.unmount();
  page = undefined;
});

const form = () =>
  document.querySelector<HTMLFormElement>("#kc-update-profile-form");
const submit = () =>
  form()?.querySelector<HTMLButtonElement>('button[type="submit"]');
const box = () =>
  form()?.querySelector<HTMLElement>('[role="checkbox"]') ?? undefined;
const posted = () =>
  form()?.querySelector<HTMLInputElement>('input[name="privacyNoticeRead"]');
const errorShown = () => form()?.textContent?.includes(SERVER_ERROR) ?? false;

const click = async (element: HTMLElement | undefined) => {
  await act(async () => {
    element?.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

describe("the privacy-notice box on the profile-completion page (MDRS-257)", () => {
  it("starts with Keycloak's error and a disabled Gönder", async () => {
    page = await renderPage(
      "login-update-profile.ftl",
      "tr",
      servedByKeycloak as never
    );

    expect(box()?.getAttribute("aria-checked")).toBe("false");
    expect(errorShown()).toBe(true);
    expect(submit()?.disabled).toBe(true);
  });

  it("clears the error and enables Gönder once the box is ticked", async () => {
    page = await renderPage(
      "login-update-profile.ftl",
      "tr",
      servedByKeycloak as never
    );

    await click(box());

    expect(box()?.getAttribute("aria-checked")).toBe("true");
    expect(errorShown()).toBe(false);
    expect(submit()?.disabled).toBe(false);
    // what the browser will post
    expect(posted()?.checked).toBe(true);
    expect(posted()?.value).toBe("yes");
  });

  it("disables Gönder again when the box is cleared", async () => {
    page = await renderPage(
      "login-update-profile.ftl",
      "tr",
      servedByKeycloak as never
    );

    await click(box());
    await click(box());

    expect(box()?.getAttribute("aria-checked")).toBe("false");
    expect(submit()?.disabled).toBe(true);
  });
});
