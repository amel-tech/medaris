// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileFieldSpec } from "../src/giris";
import {
  AuthCard,
  AuthMessage,
  ConsentForm,
  evaluatePasswordRules,
  LoginForm,
  LogoutConfirmForm,
  PasswordField,
  passwordProblems,
  RegisterForm,
  UpdatePasswordForm,
} from "../src/giris";
import { cleanup, click, render } from "./render";

afterEach(cleanup);

describe("evaluatePasswordRules", () => {
  it("meets nothing for an empty password", () => {
    expect(evaluatePasswordRules({ password: "" })).toEqual({
      length: false,
      notEmail: false,
      notUsername: false,
    });
  });

  it("checks the length against the realm's policy", () => {
    expect(evaluatePasswordRules({ password: "123456789" }).length).toBe(false);
    expect(evaluatePasswordRules({ password: "1234567890" }).length).toBe(true);
    expect(
      evaluatePasswordRules({ password: "12345678", minLength: 8 }).length
    ).toBe(true);
  });

  it("compares with the e-mail and the user name without regard to case", () => {
    const rules = evaluatePasswordRules({
      password: "Zeynep@Example.com",
      email: "zeynep@example.com",
      username: "zeynep",
    });
    expect(rules.notEmail).toBe(false);
    expect(rules.notUsername).toBe(true);
    expect(
      evaluatePasswordRules({ password: "ZEYNEP", username: "zeynep" })
        .notUsername
    ).toBe(false);
  });
});

describe("passwordProblems", () => {
  const base = { email: "a@b.co", username: "ab", minLength: 10 };
  it("reports empty, short, rule and mismatch in turn", () => {
    expect(passwordProblems({ ...base, password: "", confirm: "" })).toEqual({
      password: "empty",
      confirm: "empty",
    });
    expect(
      passwordProblems({ ...base, password: "short", confirm: "short" })
        .password
    ).toBe("tooShort");
    expect(
      passwordProblems({
        ...base,
        password: "a@b.co",
        confirm: "a@b.co",
        minLength: 3,
      }).password
    ).toBe("rules");
    expect(
      passwordProblems({ ...base, password: "longenough1", confirm: "other" })
    ).toEqual({
      confirm: "mismatch",
    });
    expect(
      passwordProblems({
        ...base,
        password: "longenough1",
        confirm: "longenough1",
      })
    ).toEqual({});
  });
});

describe("AuthCard", () => {
  it("is the page's main, named by its one h1, with the footer after a separator", async () => {
    const host = await render(
      <AuthCard title="Giriş yap" subtitle="Alt" footer="Kayıt ol">
        <p>gövde</p>
      </AuthCard>
    );
    const main = host.querySelector("main") as HTMLElement;
    expect(main.getAttribute("aria-labelledby")).toBe("kc-page-title");
    expect(host.querySelector("h1#kc-page-title")?.textContent).toBe(
      "Giriş yap"
    );
    expect(host.querySelector("hr.mds-separator")).not.toBeNull();
    expect(host.querySelector(".mds-logo__arabic")).toBeNull();
    expect(host.querySelector(".mds-logo__subtitle")).toBeNull();
  });

  it("names the app that sent the visitor under the wordmark", async () => {
    const host = await render(<AuthCard title="Giriş yap" app="nizam" />);
    expect(host.querySelector(".mds-logo__subtitle")?.textContent).toBe(
      "Nizam"
    );
    expect(host.querySelector(".mds-logo")?.getAttribute("aria-label")).toBe(
      "Medaris — Nizam"
    );
  });

  it("sets the app's name as Latin text, upper-cased the Turkish way in every language", async () => {
    const host = await render(<AuthCard title="تسجيل الدخول" app="nazar" />);
    const subtitle = host.querySelector(".mds-logo__subtitle");
    expect(subtitle?.textContent).toBe("Nazar");
    expect(subtitle?.getAttribute("lang")).toBe("tr");
    expect(subtitle?.getAttribute("dir")).toBe("ltr");
  });
});

describe("PasswordField", () => {
  it("reveals the password through one button that keeps its name", async () => {
    const host = await render(
      <PasswordField
        id="pw"
        name="password"
        label="Şifre"
        showLabel="Şifreyi göster"
      />
    );
    const input = host.querySelector("input") as HTMLInputElement;
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(input.type).toBe("password");
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(button.getAttribute("aria-label")).toBe("Şifreyi göster");
    expect(button.getAttribute("aria-controls")).toBe("pw");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await click(button);
    expect(input.type).toBe("text");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Şifreyi göster");
  });
});

describe("LoginForm", () => {
  it("posts natively with the provider's field names and keeps the user name", async () => {
    const host = await render(
      <LoginForm
        action="/login-actions/authenticate"
        requiredNote="* zorunlu alan"
        usernameLabel="Kullanıcı adı ya da e-posta"
        passwordLabel="Şifre"
        showPasswordLabel="Şifreyi göster"
        username="zeynep"
        invalid
        forgotPassword={{ href: "/reset", label: "Şifremi unuttum" }}
        submitLabel="Giriş yap"
        submittingLabel="Giriş yapılıyor"
      />
    );
    const form = host.querySelector("form") as HTMLFormElement;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe("/login-actions/authenticate");
    const user = host.querySelector(
      'input[name="username"]'
    ) as HTMLInputElement;
    expect(user.value).toBe("zeynep");
    expect(user.required).toBe(true);
    expect(user.getAttribute("aria-invalid")).toBe("true");
    expect(
      host.querySelector('input[name="password"]')?.getAttribute("aria-invalid")
    ).toBe("true");
    expect(host.querySelector("a.mds-btn--link")?.getAttribute("href")).toBe(
      "/reset"
    );
    expect(
      (host.querySelector('button[type="submit"]') as HTMLElement).textContent
    ).toBe("Giriş yap");
  });
});

const registerProps = {
  action: "/register",
  requiredNote: "* zorunlu alan",
  fields: [
    { name: "firstName", kind: "text", label: "Ad", required: true },
    { name: "lastName", kind: "text", label: "Soyad", required: true },
    {
      name: "gender",
      kind: "radio",
      label: "Cinsiyet",
      required: true,
      options: [
        { value: "FEMALE", label: "Kadın" },
        { value: "MALE", label: "Erkek" },
      ],
    },
    {
      name: "username",
      kind: "text",
      label: "Kullanıcı adı",
      required: true,
      latin: true,
    },
    {
      name: "email",
      kind: "text",
      type: "email",
      label: "E-posta",
      required: true,
      latin: true,
      help: "Doğrulama bağlantısı",
    },
    {
      name: "privacyNoticeRead",
      kind: "checkbox",
      label: "Aydınlatma Metni’ni okudum.",
      required: true,
      options: [{ value: "yes", label: "yes" }],
      requiredError: "Onayla.",
    },
  ] satisfies ProfileFieldSpec[],
  passwordAfter: "email",
  password: { name: "password", label: "Şifre", showLabel: "göster" },
  passwordConfirm: {
    name: "password-confirm",
    label: "Şifre (tekrar)",
    showLabel: "tekrar göster",
  },
  ruleLabels: {
    length: "En az 10 karakter",
    notEmail: "E-posta farklı",
    notUsername: "Ad farklı",
    met: ", karşılandı",
  },
  errors: {
    required: "Boş bırakma.",
    requiredChoice: "Birini seç.",
    passwordTooShort: "Şifre çok kısa.",
    passwordRules: "Kurallar.",
    passwordMismatch: "Eşleşmiyor.",
  },
  submitLabel: "Kayıt ol",
  submittingLabel: "Gönderiliyor",
};

const submitForm = async (form: HTMLFormElement) => {
  const submit = new Event("submit", { bubbles: true, cancelable: true });
  await act(async () => {
    form.dispatchEvent(submit);
  });
  return submit;
};

const typeInto = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("RegisterForm", () => {
  it("stops an empty submission and writes the reasons under the fields", async () => {
    const host = await render(<RegisterForm {...registerProps} />);
    const form = host.querySelector("form") as HTMLFormElement;
    const submit = await submitForm(form);
    expect(submit.defaultPrevented).toBe(true);
    const errors = [...host.querySelectorAll(".mds-error")].map(
      (e) => e.textContent
    );
    expect(errors).toContain("Boş bırakma.");
    expect(errors).toContain("Birini seç.");
    expect(errors).toContain("Onayla.");
    expect(
      host
        .querySelector('input[name="firstName"]')
        ?.getAttribute("aria-invalid")
    ).toBe("true");
  });

  it("draws the fields in the order given, the password pair after passwordAfter", async () => {
    const host = await render(<RegisterForm {...registerProps} />);
    const order = [
      ...host.querySelectorAll<HTMLInputElement>("input[name]"),
    ].map((input) => input.name);
    const unique = order.filter((name, i) => order.indexOf(name) === i);
    expect(unique).toEqual([
      "firstName",
      "lastName",
      "gender",
      "username",
      "email",
      "password",
      "password-confirm",
      "privacyNoticeRead",
    ]);
  });

  it("draws a field it was never told about by its kind", async () => {
    const host = await render(
      <RegisterForm
        {...registerProps}
        fields={[
          ...registerProps.fields,
          { name: "about", kind: "textarea", label: "Hakkında" },
          {
            name: "city",
            kind: "select",
            label: "Şehir",
            options: [{ value: "ist", label: "İstanbul" }],
          },
          {
            name: "days",
            kind: "checkboxes",
            label: "Günler",
            options: [
              { value: "pzt", label: "Pzt" },
              { value: "sal", label: "Sal" },
            ],
          },
          { name: "locale", kind: "hidden", label: "", defaultValue: "tr" },
        ]}
      />
    );
    expect(host.querySelector('textarea[name="about"]')).not.toBeNull();
    expect(host.querySelector("#city")?.getAttribute("role")).toBe("combobox");
    const days = host.querySelector("fieldset");
    expect(days?.querySelectorAll('[role="checkbox"]')).toHaveLength(2);
    expect(
      (host.querySelector('input[name="locale"]') as HTMLInputElement).value
    ).toBe("tr");
  });

  it("runs a field's own check on a filled-in value", async () => {
    const host = await render(
      <RegisterForm
        {...registerProps}
        fields={registerProps.fields.map((field) =>
          field.name === "username"
            ? {
                ...field,
                check: (value: unknown) =>
                  String(value).length < 3 ? "En az 3 harf." : undefined,
              }
            : field
        )}
      />
    );
    await typeInto(
      host.querySelector('input[name="username"]') as HTMLInputElement,
      "ab"
    );
    await submitForm(host.querySelector("form") as HTMLFormElement);
    expect(
      host
        .querySelector('input[name="username"]')
        ?.closest(".mds-field")
        ?.querySelector(".mds-error")?.textContent
    ).toBe("En az 3 harf.");
  });

  it("keeps the provider's answer until the field changes", async () => {
    const host = await render(
      <RegisterForm
        {...registerProps}
        fields={registerProps.fields.map((field) =>
          field.name === "email"
            ? { ...field, error: "Bu adres kayıtlı." }
            : field
        )}
      />
    );
    const email = host.querySelector('input[name="email"]') as HTMLInputElement;
    const line = () =>
      email.closest(".mds-field")?.querySelector(".mds-error")?.textContent;
    expect(line()).toBe("Bu adres kayıtlı.");
    await typeInto(email, "yeni@example.com");
    expect(line()).toBeUndefined();
  });

  it("lists the rules and marks each one as it is met", async () => {
    const host = await render(<RegisterForm {...registerProps} />);
    const items = () => [...host.querySelectorAll("li")];
    expect(items()).toHaveLength(3);
    expect(items().every((i) => i.getAttribute("data-met") === "false")).toBe(
      true
    );
    // a rule not met yet is a bullet, never a ring that reads as a radio
    expect(host.querySelector("li .rounded-full")).toBeNull();
    await typeInto(
      host.querySelector('input[name="password"]') as HTMLInputElement,
      "uzun-bir-sifre-1"
    );
    expect(items().every((i) => i.getAttribute("data-met") === "true")).toBe(
      true
    );
    expect(items()[0]?.textContent).toContain(", karşılandı");
  });
});

describe("ConsentForm", () => {
  it("posts the code with one of two named submits, under the list of what the app sees", async () => {
    const host = await render(
      <ConsentForm
        action="/oauth"
        code={{ name: "code", value: "abc" }}
        lead="Örnek Uygulama şunları görecek:"
        scopes={[
          { id: "email", text: "E-posta adresin" },
          { id: "gender", text: "Cinsiyetin" },
        ]}
        links={{
          intro: "Nasıl kullanıyor:",
          items: [{ href: "https://ornek.example/sartlar", label: "Şartlar" }],
          newTabNote: "Yeni sekmede açılır.",
        }}
        accept={{ name: "accept", label: "İzin ver" }}
        cancel={{ name: "cancel", label: "Vazgeç" }}
      />
    );
    const form = host.querySelector("form") as HTMLFormElement;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe("/oauth");
    const list = host.querySelector("ul") as HTMLElement;
    expect(
      host.querySelector(`#${list.getAttribute("aria-labelledby")}`)
        ?.textContent
    ).toBe("Örnek Uygulama şunları görecek:");
    expect(
      [...list.querySelectorAll("li")].map((li) => li.textContent)
    ).toEqual(["E-posta adresin", "Cinsiyetin"]);
    expect(
      (host.querySelector('input[name="code"]') as HTMLInputElement).value
    ).toBe("abc");
    const accept = host.querySelector('button[name="accept"]');
    const cancel = host.querySelector('button[name="cancel"]');
    expect(accept?.getAttribute("type")).toBe("submit");
    expect(cancel?.getAttribute("type")).toBe("submit");
    expect(accept?.className).toContain("mds-btn--primary");
    expect(cancel?.className).toContain("mds-btn--ghost");
    const link = host.querySelector("a") as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(
      host.querySelector(`#${link.getAttribute("aria-describedby")}`)
        ?.textContent
    ).toBe("Yeni sekmede açılır.");
  });
});

describe("AuthMessage and LogoutConfirmForm", () => {
  it("draws the paragraphs and one full-width link", async () => {
    const host = await render(
      <AuthMessage
        paragraphs={["bir", "iki"]}
        action={{ href: "/x", label: "Devam" }}
      />
    );
    expect(host.querySelectorAll("p.mds-body")).toHaveLength(2);
    const link = host.querySelector("a.mds-btn--full") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/x");
  });

  it("posts the one-time code with the confirm button", async () => {
    const host = await render(
      <LogoutConfirmForm
        action="/logout"
        confirmLabel="Çıkış yap"
        sessionCode={{ name: "session_code", value: "abc" }}
        cancel={{ href: "/app", label: "Vazgeç" }}
      />
    );
    expect(host.querySelector("form")?.getAttribute("action")).toBe("/logout");
    expect(
      (host.querySelector('input[name="session_code"]') as HTMLInputElement)
        .value
    ).toBe("abc");
    expect(
      host.querySelector('button[name="confirmLogout"]')?.textContent
    ).toBe("Çıkış yap");
    expect(host.querySelector("a.mds-btn--ghost")?.getAttribute("href")).toBe(
      "/app"
    );
  });
});

const updateProps = {
  action: "/update",
  requiredNote: "* zorunlu alan",
  password: registerProps.password,
  passwordConfirm: registerProps.passwordConfirm,
  ruleLabels: registerProps.ruleLabels,
  errors: {
    required: "Boş bırakma.",
    passwordTooShort: "Şifre çok kısa.",
    passwordRules: "Kurallar.",
    passwordMismatch: "Eşleşmiyor.",
  },
  signOutOthers: {
    name: "logout-sessions",
    value: "on",
    label: "Diğer cihazlarda çıkış yap",
    description: "açıklama",
  },
  submitLabel: "Kaydet",
  submittingLabel: "Gönderiliyor",
};

describe("UpdatePasswordForm", () => {
  it("does not list the e-mail rule when the account's address is unknown", async () => {
    const host = await render(
      <UpdatePasswordForm {...updateProps} username="zeynep" />
    );
    const labels = [...host.querySelectorAll("li")].map((i) => i.textContent);
    expect(labels).toHaveLength(2);
    expect(labels.join("|")).not.toContain("E-posta farklı");
  });

  it("lists the e-mail rule when the address is known", async () => {
    const host = await render(
      <UpdatePasswordForm
        {...updateProps}
        username="zeynep"
        email="z@example.test"
      />
    );
    expect(host.querySelectorAll("li")).toHaveLength(3);
  });
});
