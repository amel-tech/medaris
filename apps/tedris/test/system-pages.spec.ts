// @vitest-environment happy-dom
import { Button } from "@medaris/ui/mds/button";
import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
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
vi.mock("@medaris/auth/client", () => ({
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
    expect(link.getAttribute("href")).toBe("/home");
  });

  it("sends a signed-out visitor to the landing page, a signed-in one to /home", async () => {
    const { homeHref } = await load();
    expect(homeHref(true)).toBe("/home");
    expect(homeHref(false)).toBe("/");
    state.status = "unauthenticated";
    const { NotFoundState } = await load();
    await render(createElement(NotFoundState));
    expect(document.querySelector("a.mds-btn")?.getAttribute("href")).toBe("/");
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
    expect(link.getAttribute("href")).toBe("/decks/d-1");
  });

  it("without a deck says nothing about one and offers home", async () => {
    const { ForbiddenState } = await load();
    await render(createElement(ForbiddenState));
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Bu sayfayı görmek için yetkin yok."
    );
    expect(document.querySelector("a.mds-btn")?.getAttribute("href")).toBe(
      "/home"
    );
  });
});

describe("tedris/40: something went wrong", () => {
  it("shows the design's words and no error detail", async () => {
    const { ErrorState } = await load();
    await render(createElement(ErrorState, { retry: vi.fn() }));
    expect(document.querySelector("h1")?.textContent).toBe(
      "Bir şeyler ters gitti"
    );
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Sunucuya ulaşılamadı. İnternet bağlantını denetleyip yeniden dene."
    );
  });

  it("'Yeniden dene' calls retry", async () => {
    const retry = vi.fn();
    const { ErrorState } = await load();
    await render(createElement(ErrorState, { retry }));
    await click(button("Yeniden dene"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  // Next 16.3's `retry` reads the segment from the server again; `reset`
  // only re-rendered the payload that failed, hence the hand-made refresh
  // this page used to wrap it in.
  it("the segment boundary hands 'Yeniden dene' to Next's retry", async () => {
    const retry = vi.fn();
    const { default: ErrorPage } = await import("../app/error");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await render(
      createElement(ErrorPage, {
        error: Object.assign(new Error("boom"), { digest: "d1" }),
        retry,
      })
    );
    await click(button("Yeniden dene"));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("Segment error:", "d1");
    expect(document.body.textContent).not.toContain("boom");
    error.mockRestore();
  });

  it("global-error hands 'Yeniden dene' to Next's retry", async () => {
    const retry = vi.fn();
    const { default: GlobalError } = await import("../app/global-error");
    // It draws its own <html>, which a test cannot mount inside a <div>: the
    // button is found in what it returns and pressed there.
    const action = buttonIn(GlobalError({ retry }));
    expect(action?.props.children).toBe("Yeniden dene");
    action?.props.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === text
  ) as HTMLElement;

/** The kit's Button in an element tree, through `children` and `action`. */
const buttonIn = (
  node: ReactNode
): ReactElement<{ children: ReactNode; onClick: () => void }> | undefined => {
  if (Array.isArray(node)) return node.map(buttonIn).find(Boolean);
  if (!isValidElement(node)) return undefined;
  if (node.type === Button)
    return node as ReactElement<{ children: ReactNode; onClick: () => void }>;
  const { children, action } = node.props as {
    children?: ReactNode;
    action?: ReactNode;
  };
  return buttonIn(action) ?? buttonIn(children);
};
