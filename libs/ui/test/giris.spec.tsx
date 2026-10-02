// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthCard,
  AuthMessage,
  evaluatePasswordRules,
  LoginForm,
  LogoutConfirmForm,
  PasswordField,
  passwordProblems,
  RegisterForm,
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
  firstName: { name: "firstName", label: "Ad" },
  lastName: { name: "lastName", label: "Soyad" },
  username: { name: "username", label: "Kullanıcı adı" },
  email: { name: "email", label: "E-posta", help: "Doğrulama bağlantısı" },
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
    passwordTooShort: "Şifre çok kısa.",
    passwordRules: "Kurallar.",
    passwordMismatch: "Eşleşmiyor.",
    privacy: "Onayla.",
  },
  privacy: {
    name: "privacyNoticeRead",
    id: "privacyNoticeRead-yes",
    value: "yes",
    label: "Aydınlatma Metni’ni okudum.",
    newTabNote: "Yeni sekmede açılır.",
    newTabNoteId: "nt",
  },
  submitLabel: "Kayıt ol",
  submittingLabel: "Gönderiliyor",
};

describe("RegisterForm", () => {
  it("stops an empty submission and writes the reasons under the fields", async () => {
    const host = await render(<RegisterForm {...registerProps} />);
    const form = host.querySelector("form") as HTMLFormElement;
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => {
      form.dispatchEvent(submit);
    });
    expect(submit.defaultPrevented).toBe(true);
    const errors = [...host.querySelectorAll(".mds-error")].map(
      (e) => e.textContent
    );
    expect(errors).toContain("Boş bırakma.");
    expect(errors).toContain("Onayla.");
    expect(
      host
        .querySelector('input[name="firstName"]')
        ?.getAttribute("aria-invalid")
    ).toBe("true");
  });

  it("lists the rules and marks each one as it is met", async () => {
    const host = await render(<RegisterForm {...registerProps} />);
    const items = () => [...host.querySelectorAll("li")];
    expect(items()).toHaveLength(3);
    expect(items().every((i) => i.getAttribute("data-met") === "false")).toBe(
      true
    );
    const password = host.querySelector(
      'input[name="password"]'
    ) as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      set?.call(password, "uzun-bir-sifre-1");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(items().every((i) => i.getAttribute("data-met") === "true")).toBe(
      true
    );
    expect(items()[0]?.textContent).toContain(", karşılandı");
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
