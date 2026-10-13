import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Page from "../app/[locale]/kullanim-sartlari/page";

vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));

const render = async () =>
  renderToStaticMarkup(
    (await Page({ params: Promise.resolve({ locale: "tr" }) })) as ReactElement
  );

const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("Kullanım şartları: gender (owner, 13 October)", () => {
  it("asks it at registration, required, and once from older accounts", async () => {
    const text = textOf(await render());
    expect(text).toContain(
      "Hesap açarken ad, soyad, cinsiyet, kullanıcı adı, e-posta adresi ve şifre verilir."
    );
    expect(text).toContain(
      "Cinsiyet, kadın ya da erkek olarak seçilir ve zorunludur; daha önce açılmış hesaplardan girişte bir kez istenir."
    );
  });

  it("says why it is asked and who sees it", async () => {
    const text = textOf(await render());
    expect(text).toContain(
      "yüz yüze derslerde kadın ve erkek kontenjanlarının ayrı sayılması ve hangi talebeyle kimin iletişim kuracağının belirlenmesi için kullanılır"
    );
    expect(text).toContain(
      "ders kadrosu ile buna ihtiyaç duyan medrese ve köşk kadroları onu görür"
    );
  });
});

describe("Kullanım şartları: “Medaris ile giriş yap” (owner, 13 October)", () => {
  it("shares the name, e-mail and gender only with permission, which can be withdrawn", async () => {
    const text = textOf(await render());
    expect(text).toContain(
      "ad, soyad, e-posta adresi ve cinsiyet uygulamaya ancak izin verilirse iletilir"
    );
    expect(text).toContain(
      "Verilen izin hesaptan dilendiği zaman geri alınabilir."
    );
  });

  it("names no partner application", async () => {
    expect(textOf(await render())).not.toMatch(/sidre/i);
  });
});

describe("Kullanım şartları: date", () => {
  it("is last updated on 13 October 2026", async () => {
    const html = await render();
    expect(html).toMatch(/<time datetime="2026-10-13">13 Ekim 2026<\/time>/i);
  });
});
