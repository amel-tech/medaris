/**
 * @vitest-environment happy-dom
 *
 * The registration form is the realm's user profile: every attribute
 * `config/keycloak/user-profile.json` declares for the user is drawn by its
 * input type, in the profile's order, marked required when it is, with its
 * checks and Keycloak's answers. An attribute added to the profile needs no
 * page change; the second block adds some to the served profile and finds
 * them on the page. Replaces the fixed list (`REGISTER_ATTRIBUTES`) that a
 * profile change had to be copied into.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type RenderedPage, renderPage } from "./render-page";

type Declared = {
  name: string;
  required?: { roles?: string[] };
  permissions?: { view?: string[]; edit?: string[] };
  annotations?: { inputType?: string };
};

const PROFILE = JSON.parse(
  readFileSync(
    join(__dirname, "../../../config/keycloak/user-profile.json"),
    "utf8"
  )
) as { attributes: Declared[] };

/** What a registrant sees: every attribute the user may view or edit. */
const FOR_THE_USER = PROFILE.attributes.filter((a) =>
  [...(a.permissions?.view ?? []), ...(a.permissions?.edit ?? [])].includes(
    "user"
  )
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

const form = () =>
  document.querySelector<HTMLFormElement>("form#kc-register-form");
const named = (name: string) =>
  form()?.querySelector<HTMLElement>(`[name="${name}"]`) ?? null;
/** The field around a control: its `.mds-field`, or the group of a choice. */
const fieldOf = (name: string) =>
  named(name)?.closest<HTMLElement>(".mds-field, .mds-choice-group") ?? null;
const errorUnder = (name: string) =>
  fieldOf(name)?.querySelector(".mds-error")?.textContent ?? null;
const radio = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(
    (r) =>
      document.getElementById(r.getAttribute("aria-labelledby") ?? "")
        ?.textContent === label
  );

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

/**
 * Clicks a control the way a person does: a box on its label. happy-dom also
 * runs the label's activation on a click on the box itself, which Base UI
 * cancels in a browser, so the box would flip twice.
 */
const click = async (element: Element | null | undefined) => {
  const target =
    element?.getAttribute("role") === "checkbox"
      ? element.closest("label")?.querySelector(".mds-choice__text")
      : element;
  await act(async () => {
    (target as HTMLElement | null | undefined)?.click();
  });
  await settle();
};

const type = async (name: string, value: string) => {
  const input = named(name) as HTMLInputElement | null;
  if (!input) throw new Error(`no field ${name}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async () => {
  const event = new Event("submit", { bubbles: true, cancelable: true });
  await act(async () => {
    form()?.dispatchEvent(event);
  });
  await settle();
  return event;
};

describe("the realm's user profile on the registration form", () => {
  it("has gender, required, with the two values tedrisat keeps", () => {
    const gender = PROFILE.attributes.find((a) => a.name === "gender");
    expect(gender?.required?.roles).toEqual(
      expect.arrayContaining(["user", "admin"])
    );
    expect(gender?.annotations?.inputType).toBe("select-radiobuttons");
  });

  it("draws every attribute the user may see, in the profile's order", async () => {
    page = await renderPage("register.ftl", "tr");
    const controls = FOR_THE_USER.map(({ name }) => {
      const control = named(name);
      expect(control, name).not.toBeNull();
      return control as HTMLElement;
    });
    for (let i = 1; i < controls.length; i++) {
      expect(
        controls[i - 1]?.compareDocumentPosition(controls[i] as Node),
        `${FOR_THE_USER[i - 1]?.name} before ${FOR_THE_USER[i]?.name}`
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it("marks exactly the required ones with the asterisk", async () => {
    page = await renderPage("register.ftl", "tr");
    for (const attribute of FOR_THE_USER) {
      // Keycloak requires the user name whatever the profile says
      const required =
        attribute.name === "username" ||
        (attribute.required?.roles ?? []).includes("user");
      expect(
        fieldOf(attribute.name)?.querySelector(".mds-required") !== null,
        attribute.name
      ).toBe(required);
    }
  });

  it("puts the password pair after the later of the user name and the e-mail", async () => {
    page = await renderPage("register.ftl", "tr");
    const names = FOR_THE_USER.map((a) => a.name);
    const last = Math.max(names.indexOf("username"), names.indexOf("email"));
    const password = named("password") as Node;
    expect(
      named(names[last] as string)?.compareDocumentPosition(password)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const next = names[last + 1];
    if (next !== undefined) {
      expect(
        named("password-confirm")?.compareDocumentPosition(named(next) as Node)
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it("draws gender as a required radio group, Kadın and Erkek", async () => {
    page = await renderPage("register.ftl", "tr");
    const group = fieldOf("gender");
    expect(group?.getAttribute("role")).toBe("radiogroup");
    expect(group?.getAttribute("aria-required")).toBe("true");
    const legend = document.getElementById(
      group?.getAttribute("aria-labelledby") ?? ""
    );
    expect(legend?.textContent).toBe("Cinsiyet*");
    expect(radio("Kadın")).toBeDefined();
    expect(radio("Erkek")).toBeDefined();
    expect(
      [
        ...(group?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ??
          []),
      ].map((input) => input.value)
    ).toEqual(["FEMALE", "MALE"]);
  });

  it("names it in Arabic on an Arabic page", async () => {
    page = await renderPage("register.ftl", "ar");
    expect(radio("أنثى")).toBeDefined();
    expect(radio("ذكر")).toBeDefined();
  });

  it("stops an empty form and says why under each field, gender included", async () => {
    page = await renderPage("register.ftl", "tr");
    const event = await submit();
    expect(event.defaultPrevented).toBe(true);
    expect(errorUnder("firstName")).toBe("Lütfen bu alanı doldurun.");
    expect(errorUnder("gender")).toBe("Bir seçenek seç.");
    expect(errorUnder("privacyNoticeRead")).toBe(
      "Devam etmek için metni okuduğunu onayla."
    );
    for (const r of fieldOf("gender")?.querySelectorAll('[role="radio"]') ??
      []) {
      expect(r.getAttribute("aria-invalid")).toBe("true");
    }
    // the first field to fix has the focus
    expect(document.activeElement?.getAttribute("name")).toBe("firstName");
  });

  it("clears the gender error once one is chosen, and posts the choice", async () => {
    page = await renderPage("register.ftl", "tr");
    await submit();
    await click(radio("Kadın"));
    expect(errorUnder("gender")).toBeNull();
    expect(radio("Kadın")?.getAttribute("aria-checked")).toBe("true");
    expect(new FormData(form() as HTMLFormElement).get("gender")).toBe(
      "FEMALE"
    );
  });

  it("shows Keycloak's answer under gender until it is changed", async () => {
    page = await renderPage("register.ftl", "tr", {
      messagesPerField: {
        existsError: (...names: string[]) => names.includes("gender"),
        get: (name: string) =>
          name === "gender" ? "Lütfen bu alanı doldurun." : "",
      },
    } as never);
    expect(errorUnder("gender")).toBe("Lütfen bu alanı doldurun.");
    await click(radio("Erkek"));
    expect(errorUnder("gender")).toBeNull();
  });

  it("checks a filled-in value against the profile's validators", async () => {
    page = await renderPage("register.ftl", "tr");
    await type("username", "ab");
    await type("email", "adres-degil");
    await submit();
    expect(errorUnder("username")).toBe(
      "Uzunluk 3 ile 255 arasında olmalıdır."
    );
    expect(errorUnder("email")).toBe("Geçersiz e-posta adresi.");
  });

  it("posts a complete form", async () => {
    page = await renderPage("register.ftl", "tr");
    await type("firstName", "Zeynep");
    await type("lastName", "Karahanlı");
    await click(radio("Kadın"));
    await type("username", "zeynep.k");
    await type("email", "zeynep@example.com");
    await type("password", "uzun-bir-sifre-1");
    await type("password-confirm", "uzun-bir-sifre-1");
    await click(form()?.querySelector('[role="checkbox"]'));
    const event = await submit();
    expect(event.defaultPrevented).toBe(false);
    const data = new FormData(form() as HTMLFormElement);
    expect(data.get("gender")).toBe("FEMALE");
    expect(data.get("privacyNoticeRead")).toBe("yes");
    expect(data.get("username")).toBe("zeynep.k");
  });
});

describe("an attribute added to the profile", () => {
  const added = {
    profile: {
      attributesByName: {
        city: {
          name: "city",
          displayName: "Şehir",
          required: true,
          readOnly: false,
          validators: { options: { options: ["istanbul", "ankara"] } },
          annotations: {
            inputType: "select",
            inputOptionLabels: { istanbul: "İstanbul", ankara: "Ankara" },
          },
        },
        about: {
          name: "about",
          displayName: "Kendini tanıt",
          required: false,
          readOnly: false,
          validators: {},
          annotations: { inputType: "textarea" },
        },
        birthDate: {
          name: "birthDate",
          displayName: "Doğum tarihi",
          required: false,
          readOnly: false,
          validators: {},
          annotations: {
            inputType: "html5-date",
            inputHelperTextAfter: "İsteğe bağlı.",
          },
        },
        interests: {
          name: "interests",
          displayName: "İlgi alanların",
          required: true,
          readOnly: false,
          multivalued: true,
          validators: { options: { options: ["sarf", "nahiv", "fikih"] } },
          annotations: { inputType: "multiselect-checkboxes" },
        },
        madrasah: {
          name: "madrasah",
          displayName: "Medrese",
          required: false,
          readOnly: false,
          validators: {},
          annotations: {},
          group: {
            name: "kurum",
            displayHeader: "Kurum bilgileri",
            displayDescription: "Bağlı olduğun yer.",
            annotations: {},
            html5DataAnnotations: {},
          },
        },
        locale: {
          name: "locale",
          displayName: "locale",
          required: false,
          readOnly: false,
          validators: {},
          annotations: {},
        },
      },
    },
  };

  it("is drawn by its input type, after the realm's own, with no page change", async () => {
    page = await renderPage("register.ftl", "tr", added as never);
    expect(fieldOf("city")?.querySelector("label")?.textContent).toBe("Şehir*");
    expect(document.getElementById("city")?.getAttribute("role")).toBe(
      "combobox"
    );
    expect(named("about")?.tagName).toBe("TEXTAREA");
    expect(named("birthDate")?.getAttribute("type")).toBe("date");
    expect(fieldOf("birthDate")?.querySelector(".mds-help")?.textContent).toBe(
      "İsteğe bağlı."
    );
    const boxes = fieldOf("interests")?.querySelectorAll('[role="checkbox"]');
    expect(boxes?.length).toBe(3);
    expect(fieldOf("interests")?.querySelector(".mds-required")).not.toBeNull();
    // after the privacy box, the last of the realm's attributes
    expect(
      named("privacyNoticeRead")?.compareDocumentPosition(
        named("about") as Node
      )
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("opens its group under the group's header", async () => {
    page = await renderPage("register.ftl", "tr", added as never);
    const group = named("madrasah")?.closest("fieldset");
    const header = document.getElementById(
      group?.getAttribute("aria-labelledby") ?? ""
    );
    expect(header?.tagName).toBe("H2");
    expect(header?.textContent).toBe("Kurum bilgileri");
    expect(group?.textContent).toContain("Bağlı olduğun yer.");
  });

  it("asks for a choice of a required group of boxes", async () => {
    page = await renderPage("register.ftl", "tr", added as never);
    await submit();
    expect(errorUnder("interests")).toBe("Bir seçenek seç.");
    expect(errorUnder("city")).toBe("Bir seçenek seç.");
    await click(fieldOf("interests")?.querySelector('[role="checkbox"]'));
    expect(errorUnder("interests")).toBeNull();
    expect(new FormData(form() as HTMLFormElement).getAll("interests")).toEqual(
      ["sarf"]
    );
  });

  it("posts Keycloak's locale as the page's language, without showing it", async () => {
    page = await renderPage("register.ftl", "ar", added as never);
    const locale = named("locale") as HTMLInputElement | null;
    expect(locale?.type).toBe("hidden");
    expect(locale?.value).toBe("ar");
  });
});
