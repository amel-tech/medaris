import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Page from "../app/[locale]/sss/page";
import { isPlaceholder } from "../content/karsilama";
import { legal } from "../content/legal";

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

  it("leaves the fee question out until the owner gives its answer", async () => {
    expect(isPlaceholder(legal.feeInformation)).toBe(true);
    const text = textOf(await render());
    expect(text).not.toContain("Medaris ücretli mi?");
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

  it("does not promise a reply the contact form cannot deliver yet", async () => {
    expect(textOf(await render())).not.toMatch(/cevap verilir/);
  });
});
