// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render } from "./dom";

const state = vi.hoisted(() => ({
  locale: "tr",
  status: "authenticated" as "authenticated" | "unauthenticated",
}));
vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => state.locale,
    useTranslations:
      (namespace: string) =>
      (name: string, values?: Record<string, string>) => {
        const text = [
          ...namespace.split("."),
          ...name.split("."),
        ].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources[state.locale as keyof typeof resources]
        ) as string;
        return text.replace(/\{(\w+)\}/g, (_, key) => values?.[key] ?? "");
      },
  };
});
// The faces are a Google Fonts link; a DOM test must not fetch it.
vi.mock("@medaris/tokens/medaris-fonts", () => ({
  textFontsHref: "data:text/css,",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: state.status }),
}));

afterEach(cleanup);

const load = () => import("~/features/errors/system-page");

describe("tedris/38: not found", () => {
  it("says the design's words and offers the way home", async () => {
    const { NotFoundState } = await load();
    await render(createElement(NotFoundState));
    expect(document.querySelector("h1")?.textContent).toBe("Sayfa bulunamadı");
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Aradığın sayfa yok ya da artık burada değil. Adresi kontrol et ya da ana sayfadan devam et."
    );
    const link = document.querySelector("a.mds-btn") as HTMLAnchorElement;
    expect(link.textContent).toBe("Ana sayfaya dön");
    expect(link.getAttribute("href")).toBe("/tr/home");
  });

  it("sends a signed-out visitor to the landing page, a signed-in one to /home", async () => {
    const { homeHref } = await load();
    expect(homeHref("tr", true)).toBe("/tr/home");
    expect(homeHref("tr", false)).toBe("/tr");
    state.status = "unauthenticated";
    const { NotFoundState } = await load();
    await render(createElement(NotFoundState));
    expect(document.querySelector("a.mds-btn")?.getAttribute("href")).toBe(
      "/tr"
    );
    state.status = "authenticated";
  });

  it("is a section inside the shell, not a second <main>", async () => {
    const { NotFoundState } = await load();
    await render(createElement(NotFoundState));
    expect(document.querySelector("main")).toBeNull();
    expect(document.querySelector("section.mds-system-state")).not.toBeNull();
  });
});

describe("tedris/39: forbidden", () => {
  it("names the deck and the rule, and goes back to the deck", async () => {
    const { ForbiddenState } = await load();
    await render(
      createElement(ForbiddenState, { deck: { id: "d-1", name: "Kırk hadis" } })
    );
    expect(document.querySelector("h1")?.textContent).toBe(
      "Bu sayfayı göremezsin"
    );
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Kırk hadis herkese açık bir deste; kartlarını yalnız sahibi düzenler. Desteyi çalışabilirsin; istediğin kartı kendi destene kopyalayabilirsin."
    );
    const link = document.querySelector("a.mds-btn") as HTMLAnchorElement;
    expect(link.textContent).toBe("Desteye dön");
    expect(link.getAttribute("href")).toBe("/tr/decks/d-1");
  });

  it("without a deck says nothing about one and offers home", async () => {
    const { ForbiddenState } = await load();
    await render(createElement(ForbiddenState));
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Bu sayfayı görmek için yetkin yok."
    );
    expect(document.querySelector("a.mds-btn")?.getAttribute("href")).toBe(
      "/tr/home"
    );
  });
});

describe("tedris/40: something went wrong", () => {
  it("shows the design's words and no error detail", async () => {
    const { ErrorState } = await load();
    await render(createElement(ErrorState, { reset: vi.fn() }));
    expect(document.querySelector("h1")?.textContent).toBe(
      "Bir şeyler ters gitti"
    );
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Sunucuya ulaşılamadı. İnternet bağlantını denetleyip yeniden dene."
    );
  });

  it("'Yeniden dene' calls reset", async () => {
    const reset = vi.fn();
    const { ErrorState } = await load();
    await render(createElement(ErrorState, { reset }));
    const retry = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Yeniden dene"
    ) as HTMLElement;
    await click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
