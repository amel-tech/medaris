/**
 * @vitest-environment happy-dom
 *
 * MDRS-155: what the adapters in `src/login/pages` read from Keycloak's
 * context and hand to `@medaris/ui/giris` (canvas medaris/01, 03, 05, 07, 12,
 * 13, 14, 17). The realm's user profile against the registration form is
 * `register-profile.spec.tsx`.
 */
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { messageRef } from "../src/login/KcPageStory";
import { withKcLocale } from "../src/login/locale-url";
import { type RenderedPage, renderPage } from "./render-page";

let page: RenderedPage | undefined;

beforeAll(async () => {
  await import("keycloakify/login/i18n/messages_defaultSet/tr");
});

afterEach(() => {
  page?.unmount();
  page = undefined;
});

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector);

describe("login.ftl", () => {
  it("posts to loginAction with the canvas texts and links", async () => {
    page = await renderPage("login.ftl", "tr");
    expect(q("h1")?.textContent).toBe("Giriş yap");
    expect(document.body.textContent).toContain(
      "Derslerine kaldığın yerden devam et."
    );
    expect(document.body.textContent).toContain("* zorunlu alan");
    const form = q<HTMLFormElement>("form#kc-form-login");
    expect(form?.getAttribute("action")).toBe(page.kcContext.url.loginAction);
    expect(q('input[name="username"]')).not.toBeNull();
    expect(q('input[name="password"]')).not.toBeNull();
    expect(q("#kc-registration")?.getAttribute("href")).toBe(
      withKcLocale(
        (page.kcContext.url as Record<string, string>).registrationUrl ?? "",
        "tr"
      )
    );
    expect(q("a.mds-btn--link")?.textContent).toBe("Şifremi unuttum");
  });

  it("shows Keycloak's reason as one Alert, keeps the user name and marks both fields", async () => {
    page = await renderPage("login.ftl", "tr", {
      login: { username: "zeynep" },
      message: {
        type: "error",
        summary: "Geçersiz kullanıcı adı ya da şifre.",
      },
      messagesPerField: {
        existsError: () => true,
        get: () => "x",
        getFirstError: () => "x",
      },
    } as never);
    expect(q('.mds-alert[role="alert"]')?.textContent).toContain(
      "Geçersiz kullanıcı adı ya da şifre."
    );
    expect(q<HTMLInputElement>('input[name="username"]')?.value).toBe("zeynep");
    expect(q('input[name="username"]')?.getAttribute("aria-invalid")).toBe(
      "true"
    );
    expect(q('input[name="password"]')?.getAttribute("aria-invalid")).toBe(
      "true"
    );
  });

  it.each([
    ["nizam-dev", "Nizam"],
    ["tedris", "Tedris"],
    ["nazar-dev", "Nazar"],
  ])("names the app of client %s under the logo", async (clientId, name) => {
    page = await renderPage("login.ftl", "tr", {
      client: { clientId },
    } as never);
    expect(q(".mds-logo__subtitle")?.textContent).toBe(name);
  });

  it("draws no app name for a client that is not a Medaris app", async () => {
    page = await renderPage("login.ftl", "tr", {
      client: { clientId: "ornek-uygulama" },
    } as never);
    expect(q(".mds-logo__subtitle")).toBeNull();
  });
});

describe("info.ftl", () => {
  const info = (extra: object) =>
    renderPage("info.ftl", "tr", {
      messageHeader: undefined,
      requiredActions: undefined,
      skipLink: false,
      pageRedirectUri: undefined,
      actionUri: undefined,
      client: { baseUrl: undefined },
      ...extra,
    } as never);
  const href = () => q("#kc-info-link")?.getAttribute("href");

  it("takes pageRedirectUri first, then actionUri, then the client's baseUrl", async () => {
    page = await info({
      pageRedirectUri: "/a",
      actionUri: "/b",
      client: { baseUrl: "/c" },
    });
    expect(href()).toBe("/a");
    page.unmount();
    page = await info({ actionUri: "/b", client: { baseUrl: "/c" } });
    expect(href()).toBe("/b");
    page.unmount();
    page = await info({ client: { baseUrl: "/c" } });
    expect(href()).toBe("/c");
    expect(q("#kc-info-link")?.textContent).toBe("Medaris’e devam et");
  });

  it("offers no way on without a target or with skipLink", async () => {
    page = await info({});
    expect(q("#kc-info-link")).toBeNull();
    page.unmount();
    page = await info({ pageRedirectUri: "/a", skipLink: true });
    expect(q("#kc-info-link")).toBeNull();
  });

  it("splits the verified-e-mail message into its title and its sentence", async () => {
    page = await info({
      message: {
        type: "success",
        summary:
          "Hesabın etkinleşti. Köşkleri keşfedip derslere başvurabilirsin.",
      },
    });
    expect(q("h1")?.textContent).toBe("E-posta adresin doğrulandı");
    expect(q("p.mds-body")?.textContent).toContain("Hesabın etkinleşti.");
  });

  it("shows a header Keycloak sends over its own sentence (canvas 17)", async () => {
    page = await info({
      messageHeader: "E-posta adresin değişti",
      message: {
        type: "success",
        summary: "Yeni adresin hesabına kaydedildi.",
      },
    });
    expect(q("h1")?.textContent).toBe("E-posta adresin değişti");
    expect(q("p.mds-body")?.textContent).toBe(
      "Yeni adresin hesabına kaydedildi."
    );
  });
});

describe("the state pages", () => {
  it("error.ftl: two sentences and a way back to the start of the sign-in", async () => {
    page = await renderPage("error.ftl", "tr");
    expect(q("h1")?.textContent).toBe("Giriş tamamlanamadı");
    expect(document.body.textContent).toContain(
      "Giriş işlemin yarıda kaldı ya da geçersiz hâle geldi."
    );
    expect(document.body.textContent).toContain(
      "Giriş sayfasına dönüp baştan dene."
    );
    expect(q("#backToApplication")?.textContent).toBe("Giriş sayfasına dön");
    expect(q("#backToApplication")?.getAttribute("href")).toBe(
      (page.kcContext.client as { baseUrl?: string }).baseUrl ??
        page.kcContext.url.loginRestartFlowUrl
    );
  });

  it("error.ftl: the client's start page wins over the restart URL, which answers 400 without an auth session", async () => {
    page = await renderPage("error.ftl", "tr", {
      client: { baseUrl: "https://tedris.example.org" },
      url: { loginRestartFlowUrl: "https://kc.example.org/restart" },
    });
    expect(q("#backToApplication")?.getAttribute("href")).toBe(
      "https://tedris.example.org"
    );
  });

  it("error.ftl: without a client start page the way back is the restart URL", async () => {
    page = await renderPage("error.ftl", "tr", {
      client: { baseUrl: undefined },
      url: { loginRestartFlowUrl: "https://kc.example.org/restart" },
    });
    expect(q("#backToApplication")?.getAttribute("href")).toBe(
      "https://kc.example.org/restart"
    );
  });

  it("login-page-expired.ftl: one 'Yeniden dene' that restarts the flow", async () => {
    page = await renderPage("login-page-expired.ftl", "tr");
    expect(q("h1")?.textContent).toBe("Bu sayfanın süresi doldu");
    expect(q("#loginRestartLink")?.textContent).toBe("Yeniden dene");
    expect(q("#loginRestartLink")?.getAttribute("href")).toBe(
      page.kcContext.url.loginRestartFlowUrl
    );
  });

  it("logout-confirm.ftl: posts the session code, cancel goes back", async () => {
    page = await renderPage("logout-confirm.ftl", "tr", {
      client: { baseUrl: "/app" },
      logoutConfirm: { code: "kod", skipLink: false },
    } as never);
    expect(q("h1")?.textContent).toBe("Çıkış yapılsın mı?");
    expect(q("form")?.getAttribute("action")).toBe(
      (page.kcContext.url as Record<string, string>).logoutConfirmAction
    );
    expect(q<HTMLInputElement>('input[name="session_code"]')?.value).toBe(
      "kod"
    );
    expect(q("#kc-logout")?.textContent).toBe("Çıkış yap");
    expect(q("#kc-cancel-logout")?.getAttribute("href")).toBe("/app");
  });
});

describe("register.ftl and login-update-password.ftl", () => {
  it("register posts to registrationAction with the profile's field names", async () => {
    page = await renderPage("register.ftl", "tr");
    expect(q("h1")?.textContent).toBe("Kayıt ol");
    const form = q<HTMLFormElement>("form#kc-register-form");
    expect(form?.getAttribute("action")).toBe(
      (page.kcContext.url as Record<string, string>).registrationAction
    );
    for (const name of [
      "firstName",
      "lastName",
      "username",
      "email",
      "password",
      "password-confirm",
      "gender",
      "privacyNoticeRead",
    ]) {
      expect(q(`[name="${name}"]`), name).not.toBeNull();
    }
    expect(document.body.textContent).toContain(
      "Doğrulama bağlantısını bu adrese göndereceğiz."
    );
    expect(document.body.textContent).toContain("Hesabın var mı?");
    expect(q("#kc-login")?.getAttribute("href")).toBe(
      withKcLocale(page.kcContext.url.loginUrl, "tr")
    );
  });

  it("update-password sends logout-sessions, ticked from the start", async () => {
    page = await renderPage("login-update-password.ftl", "tr");
    expect(q("h1")?.textContent).toBe("Yeni şifreni belirle");
    expect(q('input[name="password-new"]')).not.toBeNull();
    expect(q('input[name="password-confirm"]')).not.toBeNull();
    const box = q<HTMLInputElement>('input[name="logout-sessions"]');
    expect(box?.value).toBe("on");
    expect(q('[role="checkbox"][aria-checked="true"]')).not.toBeNull();
    expect(document.body.textContent).toContain(
      "Hesabın başka bir cihazda açık kaldıysa oradan da çıkılır."
    );
  });

  it("update-password measures 'not the e-mail' against an address, never the user name", async () => {
    const typeInto = async (value: string) => {
      const input = q<HTMLInputElement>('input[name="password-new"]');
      if (!input) throw new Error("no password field");
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const emailRule = () =>
      [...document.querySelectorAll("li")].find((li) =>
        li.textContent?.includes("E-posta adresinden farklı")
      );
    page = await renderPage("login-update-password.ftl", "tr", {
      username: "s25kayit",
      user: { email: "s25kayit@example.test" },
    } as never);
    await typeInto("s25kayit@example.test");
    expect(emailRule()?.textContent).not.toContain("karşılandı");
    await typeInto("s25kayit");
    expect(emailRule()?.textContent).toContain("karşılandı");
  });
});

describe("the login and register forms keep the page's language between them (MDRS-274)", () => {
  for (const tag of ["en", "ar"] as const) {
    it(`login → register and register → login carry kc_locale=${tag}`, async () => {
      // the mock's URLs are "#"; Keycloak's are absolute
      page = await renderPage("login.ftl", tag, {
        url: {
          registrationUrl:
            "https://auth.example/realms/r/registrations?client_id=nizam",
        },
      });
      const register = new URL(
        q("#kc-registration")?.getAttribute("href") ?? ""
      );
      expect(register.searchParams.get("kc_locale")).toBe(tag);
      page = await renderPage("register.ftl", tag, {
        url: {
          loginUrl:
            "https://auth.example/realms/r/login-actions/authenticate?client_id=nizam",
        },
      });
      const login = new URL(q("#kc-login")?.getAttribute("href") ?? "");
      expect(login.searchParams.get("kc_locale")).toBe(tag);
    });
  }

  it("withKcLocale replaces a kc_locale already there and leaves a bad URL alone", () => {
    expect(
      withKcLocale("https://auth.example/realms/r/login?kc_locale=tr&x=1", "en")
    ).toBe("https://auth.example/realms/r/login?kc_locale=en&x=1");
    expect(withKcLocale("not a url", "en")).toBe("not a url");
    expect(withKcLocale("https://auth.example/a", undefined)).toBe(
      "https://auth.example/a"
    );
  });
});

describe("login-update-profile.ftl (canvas medaris/10)", () => {
  const missingGender = {
    messagesPerField: {
      existsError: (...names: string[]) => names.includes("gender"),
      get: (name: string) =>
        name === "gender" ? "Lütfen bu alanı doldurun." : "",
      exists: (name: string) => name === "gender",
    },
  };

  it("asks an account without gender for it, with Keycloak's reason under the choice", async () => {
    page = await renderPage(
      "login-update-profile.ftl",
      "tr",
      missingGender as never
    );
    expect(q("h1")?.textContent).toBe("Profilini tamamla");
    expect(document.body.textContent).toContain(
      "Hesabında eksik bilgi var. Tamamladığında kaldığın yerden devam edersin."
    );
    const group = q('[role="radiogroup"]');
    expect(group?.textContent).toContain("Cinsiyet");
    expect(group?.querySelector(".mds-error")?.textContent).toBe(
      "Lütfen bu alanı doldurun."
    );
    const submit = q<HTMLButtonElement>(
      '#kc-update-profile-form button[type="submit"]'
    );
    expect(submit?.textContent).toBe("Kaydet ve devam et");
    expect(submit?.disabled).toBe(true);

    const kadin = [
      ...document.querySelectorAll<HTMLElement>('[role="radio"]'),
    ][0];
    await act(async () => {
      kadin?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(group?.querySelector(".mds-error")).toBeNull();
    expect(submit?.disabled).toBe(false);
    const data = new FormData(
      q<HTMLFormElement>("#kc-update-profile-form") as HTMLFormElement
    );
    expect(data.get("gender")).toBe("FEMALE");
  });

  it("shows the read-only user name without posting it", async () => {
    page = await renderPage("login-update-profile.ftl", "tr");
    const username = q<HTMLInputElement>("input#username");
    expect(username?.readOnly).toBe(true);
    expect(username?.hasAttribute("name")).toBe(false);
    expect(username?.closest(".mds-field")?.textContent).toContain(
      "Salt okunur; buradan değiştirilemez."
    );
  });

  it("an app that sent the user here gets Vazgeç and no sentence about missing details", async () => {
    page = await renderPage("login-update-profile.ftl", "tr", {
      isAppInitiatedAction: true,
    } as never);
    expect(document.body.textContent).not.toContain(
      "Hesabında eksik bilgi var"
    );
    expect(q('button[name="cancel-aia"]')?.textContent).toBe("Vazgeç");
  });
});

describe("login-oauth-grant.ftl (consent)", () => {
  const partner = {
    client: {
      clientId: "ornek-uygulama",
      name: "Örnek Uygulama",
      attributes: {
        tosUri: "https://ornek.example/kullanim-sartlari",
        policyUri: "javascript:alert(1)",
      },
    },
    oauth: {
      code: "tek-kullanimlik",
      client: "ornek-uygulama",
      clientScopesRequested: [
        { consentScreenText: messageRef("fullNameScopeConsentText") },
        { consentScreenText: messageRef("emailScopeConsentText") },
        { consentScreenText: messageRef("genderScopeConsentText") },
      ],
    },
    url: { oauthAction: "https://auth.example/oauth" },
  };

  it("names the app and what it will see, in the scopes' consent texts", async () => {
    page = await renderPage("login-oauth-grant.ftl", "tr", partner as never);
    expect(q("h1")?.textContent).toBe(
      "Bilgilerin Örnek Uygulama ile paylaşılsın mı?"
    );
    expect(
      [...document.querySelectorAll("#kc-oauth li")].map((li) => li.textContent)
    ).toEqual(["Adın ve soyadın", "E-posta adresin", "Cinsiyetin"]);
  });

  it("posts the code with İzin ver or Vazgeç, under the names Keycloak reads", async () => {
    page = await renderPage("login-oauth-grant.ftl", "tr", partner as never);
    const form = q<HTMLFormElement>("form#kc-oauth");
    expect(form?.getAttribute("action")).toBe("https://auth.example/oauth");
    expect(form?.method).toBe("post");
    expect(q<HTMLInputElement>('input[name="code"]')?.value).toBe(
      "tek-kullanimlik"
    );
    expect(q('button[name="accept"]')?.textContent).toBe("İzin ver");
    expect(q('button[name="cancel"]')?.textContent).toBe("Vazgeç");
  });

  it("links the app's terms in a new tab and drops a link that is not http(s)", async () => {
    page = await renderPage("login-oauth-grant.ftl", "tr", partner as never);
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>("#kc-oauth a"),
    ];
    expect(links.map((a) => a.textContent)).toEqual(["Kullanım şartları"]);
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(
      document.getElementById(links[0]?.getAttribute("aria-describedby") ?? "")
        ?.textContent
    ).toBe("Yeni sekmede açılır.");
  });

  it("reads right to left in Arabic", async () => {
    page = await renderPage("login-oauth-grant.ftl", "ar", partner as never);
    expect(document.documentElement.dir).toBe("rtl");
    expect(q("h1")?.textContent).toBe("هل تشارك بياناتك مع Örnek Uygulama؟");
    expect(q('button[name="accept"]')?.textContent).toBe("السماح");
  });
});
