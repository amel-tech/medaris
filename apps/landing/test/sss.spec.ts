import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Page from "../app/[locale]/sss/page";

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

describe("Sık sorulan sorular", () => {
  it("shows no bracketed placeholder", async () => {
    expect(textOf(await render())).not.toMatch(/\[[^\]]+\]/);
  });

  // d-1004-29, the owner: "bir şey yazma, soran olursa bize sorsun".
  it("says nothing about fees", async () => {
    const text = textOf(await render());
    expect(text).not.toMatch(/ücret/i);
    expect(text).toContain("Hesabımı nasıl silerim?");
  });

  it("says there is no self-service deletion and sends the request to the controller", async () => {
    const text = textOf(await render());
    expect(text).toContain("Hesabınızı şimdilik kendiniz silemezsiniz.");
    expect(text).toContain("veri sorumlusuna yazarak isteyebilirsiniz");
  });

  it("names the köşks the way the owner does, not the old sample names", async () => {
    const text = textOf(await render());
    expect(text).toContain("Hadis Köşkü");
    expect(text).not.toMatch(/Nûruosmaniye|Fatih Köşkü/);
  });

  it("says the course staff add the live stream, and times follow the course's time zone", async () => {
    const text = textOf(await render());
    expect(text).not.toMatch(/Müderris canlı yayın/);
    expect(text).toContain(
      "Ders kadrosu bir YouTube canlı yayın bağlantısı eklediyse"
    );
    expect(text).not.toMatch(/İstanbul saatiyle, tek saat olarak/);
    expect(text).toContain("Celse saatleri dersin saat diliminde yazılır.");
  });

  it("answers notes and questions, which the open pull requests add", async () => {
    const text = textOf(await render());
    expect(text).toContain("Celse videosuna not alabilir miyim?");
    expect(text).toContain("Ders kadrosuna nasıl soru sorarım?");
  });

  it("does not promise a reply the contact form cannot deliver yet", async () => {
    expect(textOf(await render())).not.toMatch(/cevap verilir/);
  });
});
