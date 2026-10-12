// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Button } from "@medaris/ui/mds/button";
import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render } from "./dom";

/**
 * nizam had no error boundary at all: a page or the shell that threw drew
 * Next's bare English screen, with no shell and no way to try again. A page
 * now fails inside the shell (`[locale]/error.tsx`), and the shell itself in
 * a document of its own (`global-error.tsx`), each in the address's language
 * and each retrying through Next's `retry`.
 */

const state = vi.hoisted(() => ({ pathname: "/tr" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next-intl", async (orig) => ({
  ...(await orig<typeof import("next-intl")>()),
  useTranslations: (namespace: string) => (key: string) =>
    [...namespace.split("."), ...key.split(".")].reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr
    ),
}));
// The faces are a Google Fonts link; a DOM test must not fetch it.
vi.mock("@medaris/tokens/medaris-fonts", () => ({
  textFontsHref: "data:text/css,",
}));

afterEach(cleanup);

const failure = () =>
  Object.assign(new Error("relation kosks does not exist"), { digest: "d1" });

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

describe("a page that threw, inside the shell", () => {
  const words = resources.tr.nizam.PageError;
  const mount = async (retry = vi.fn()) => {
    const { default: ErrorPage } = await import("../app/[locale]/error");
    await render(createElement(ErrorPage, { error: failure(), retry }));
    return retry;
  };

  it("says so in the nazım's words, and never shows the error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe(words.title);
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      words.body
    );
    expect(document.body.textContent).not.toContain("relation kosks");
    // Only the digest, which matches the server's log.
    expect(log).toHaveBeenCalledWith("Segment error:", "d1");
    log.mockRestore();
  });

  it("is a section of the shell's <main>, not a page of its own", async () => {
    await mount();
    expect(document.querySelector("main")).toBeNull();
    expect(document.querySelector("section.mds-system-state")).not.toBeNull();
  });

  it("'Yeniden dene' calls Next's retry, which reads the page again", async () => {
    const retry = await mount();
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === words.retry
    ) as HTMLElement;
    await click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("global-error: the shell itself threw", () => {
  const draw = async (pathname: string, retry = vi.fn()) => {
    state.pathname = pathname;
    const { default: GlobalError } = await import("../app/global-error");
    return {
      html: renderToStaticMarkup(
        createElement(GlobalError, { error: failure(), retry })
      ),
      tree: GlobalError({ error: failure(), retry }),
    };
  };

  it.each([
    ["/ar/kosks/k1", "ar", "rtl"],
    ["/en/arsiv", "en", "ltr"],
    ["/tr", "tr", "ltr"],
  ] as const)("on %s speaks %s, %s", async (pathname, lang, dir) => {
    const { html } = await draw(pathname);
    const words = resources[lang].common.globalError;
    expect(html).toMatch(new RegExp(`^<html lang="${lang}" dir="${dir}"`));
    expect(html).toContain(`>${words.title}</h1>`);
    expect(html).toContain(words.text);
    expect(html).toContain(`>${words.retry}</button>`);
  });

  it("falls back to Turkish on an address with no locale it knows", async () => {
    const { html } = await draw("/xx/kosks");
    expect(html).toMatch(/^<html lang="tr" dir="ltr"/);
    expect(html).toContain(resources.tr.common.globalError.title);
  });

  it("draws its own light document with the faces, and never the error", async () => {
    const { html } = await draw("/tr/kosks");
    expect(html).toMatch(/^<html[^>]* data-theme="light"/);
    expect(html).toContain('href="data:text/css,"');
    expect(html).toContain("<main");
    expect(html).not.toContain("relation kosks");
  });

  it("'Yeniden dene' calls Next's retry, which asks for the shell again", async () => {
    const retry = vi.fn();
    // It draws its own <html>, which a test cannot mount inside a <div>: the
    // button is found in what it returns and pressed there.
    const action = buttonIn((await draw("/tr", retry)).tree);
    expect(action?.props.children).toBe(resources.tr.common.globalError.retry);
    action?.props.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
