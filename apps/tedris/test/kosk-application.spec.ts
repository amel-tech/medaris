// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLICATION_FIELDS,
  type ApplicationDraft,
  PHONE_PATTERN,
  validateApplication,
} from "~/features/kosk-application/model";
import { cleanup, click, render } from "./dom";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), notify: vi.fn() }));

vi.mock("next-intl", async (orig) =>
  (await import("./intl-mock")).intlMock(await orig())
);
vi.mock("~/features/kosk-application/actions", () => ({
  submitKoskApplication: mocks.submit,
}));
// The component imports the action through a relative path; mock both spellings.
vi.mock("../features/kosk-application/actions", () => ({
  submitKoskApplication: mocks.submit,
}));
vi.mock("@medaris/ui/mds/toast", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const valid: ApplicationDraft = {
  name: "Davutpaşa Köşkü",
  field: "AQEEDAH_KALAM",
  summary: "Akaid ve kelâm metinlerini şerhleriyle okuyan bir köşk.",
  reason: "Davutpaşa'da yüz yüze yürüyen bir akaid halkamız var.",
  email: "omer@example.com",
  phone: "",
};

describe("application model", () => {
  it("lists the eleven fields of the design (criterion 2)", () => {
    expect(APPLICATION_FIELDS).toHaveLength(11);
    expect(APPLICATION_FIELDS.map((f) => f.value)).toContain("OTHER");
  });

  it("accepts a complete form with no phone (criterion 4)", () => {
    expect(validateApplication(valid)).toEqual({});
  });

  it("flags each missing required field and a malformed e-mail or phone", () => {
    expect(
      validateApplication({
        name: " ",
        field: "",
        summary: "",
        reason: "",
        email: "",
        phone: "",
      })
    ).toEqual({
      name: "required",
      field: "required",
      summary: "required",
      reason: "required",
      email: "required",
    });
    expect(validateApplication({ ...valid, email: "nope" }).email).toBe(
      "email"
    );
    expect(validateApplication({ ...valid, phone: "abc" }).phone).toBe("phone");
    expect(
      validateApplication({ ...valid, phone: "+90 532 000 00 00" })
    ).toEqual({});
    expect(PHONE_PATTERN.test("0212 555 01 01")).toBe(true);
  });
});

const mount = async (email = "omer@example.com") => {
  const { KoskApplicationPage } = await import(
    "~/features/kosk-application/components/kosk-application-page"
  );
  return render(
    createElement(KoskApplicationPage, {
      email,
      privacyNoticeHref: "https://landing-dev.medaris.app/aydinlatma-metni",
    })
  );
};

describe("Köşk açma başvurusu (design tedris/37)", () => {
  it("pre-fills the e-mail from the account, leaves it editable, and lists the three steps", async () => {
    const host = await mount();
    const email = host.querySelector('input[name="email"]') as HTMLInputElement;
    expect(email.value).toBe("omer@example.com");
    expect(email.readOnly).toBe(false);
    expect(host.textContent).toContain("Başvurundan sonra");
    expect(host.querySelectorAll("ol li")).toHaveLength(3);
  });

  it("does not send an incomplete form and marks the empty fields (criterion 1)", async () => {
    const host = await mount();
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Köşk adını yaz.");
    expect(host.textContent).toContain("Bir alan seç.");
  });

  it("'Vazgeç' is a link back to Keşfet and sends nothing (criterion 5)", async () => {
    const host = await mount();
    const cancel = [...host.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Vazgeç")
    );
    expect(cancel?.getAttribute("href")).toBe("/tr/discover");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("links the Aydınlatma Metni to the notice the page resolved for this deployment (MDRS-248)", async () => {
    const host = await mount();
    const link = [...host.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Aydınlatma Metni")
    );
    expect(link?.getAttribute("href")).toBe(
      "https://landing-dev.medaris.app/aydinlatma-metni"
    );
  });
});
