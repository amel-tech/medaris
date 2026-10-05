// @vitest-environment happy-dom

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  themeFromStored,
  themeScript,
} from "../src/lib/theme";
import { ThemeScript } from "../src/mds/theme-script";
import { ThemeToggle } from "../src/mds/theme-toggle";
import { cleanup, click, render } from "./render";

const html = document.documentElement;

beforeEach(() => {
  html.removeAttribute("data-theme");
  window.localStorage.clear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

const runScript = () => new Function(themeScript)();

describe("the no-flash script", () => {
  it("uses the key medaris-theme", () => {
    expect(THEME_STORAGE_KEY).toBe("medaris-theme");
    expect(themeScript).toContain('"medaris-theme"');
  });

  it("sets dark when the stored value is exactly dark", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runScript();
    expect(html.dataset.theme).toBe("dark");
  });

  it.each([
    ["missing", null],
    ["light", "light"],
    ["garbage", "midnight"],
    ["different case", "Dark"],
    ["padded", " dark"],
    ["empty", ""],
  ])("sets light when the stored value is %s", (_name, stored) => {
    if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    html.dataset.theme = "dark";
    runScript();
    expect(html.dataset.theme).toBe("light");
  });

  it("sets light when reading the storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    runScript();
    expect(html.dataset.theme).toBe("light");
  });

  it("sets light when the storage does not exist at all", () => {
    vi.stubGlobal("localStorage", undefined);
    try {
      runScript();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(html.dataset.theme).toBe("light");
  });

  it("is rendered as an inline script that reads no system preference", () => {
    const markup = renderToStaticMarkup(<ThemeScript />);
    expect(markup.startsWith("<script>")).toBe(true);
    expect(markup).toContain("medaris-theme");
    expect(themeScript).not.toContain("matchMedia");
    expect(themeScript).not.toContain("prefers-color-scheme");
  });

  it.each([
    ["dark", "dark"],
    ["light", "light"],
    ["x", "light"],
    [null, "light"],
    [undefined, "light"],
  ] as const)("reads %s as %s", (stored, theme) => {
    expect(themeFromStored(stored)).toBe(theme);
  });
});

const button = (host: HTMLElement) =>
  host.querySelector("button") as HTMLButtonElement;

describe("ThemeToggle", () => {
  it("renders the same markup on the server as the first client render", async () => {
    html.dataset.theme = "dark";
    const server = renderToStaticMarkup(<ThemeToggle />);
    expect(server).toContain('aria-label="Koyu temaya geç"');
    expect(server).toContain("mds-icon-btn");
    html.dataset.theme = "light";
    const host = await render(<ThemeToggle />);
    expect(button(host).getAttribute("aria-label")).toBe("Koyu temaya geç");
  });

  it("names the action in Turkish and takes labels as props", async () => {
    const host = await render(
      <ThemeToggle darkLabel="To dark" lightLabel="To light" />
    );
    expect(button(host).getAttribute("aria-label")).toBe("To dark");
    await click(button(host));
    expect(button(host).getAttribute("aria-label")).toBe("To light");
  });

  it("toggles data-theme on <html> and writes the key", async () => {
    html.dataset.theme = "light";
    const host = await render(<ThemeToggle />);
    await click(button(host));
    expect(html.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(button(host).getAttribute("aria-label")).toBe("Açık temaya geç");
    await click(button(host));
    expect(html.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(button(host).getAttribute("aria-label")).toBe("Koyu temaya geç");
  });

  it("picks up a dark page the script set before hydration", async () => {
    html.dataset.theme = "dark";
    const host = await render(<ThemeToggle />);
    expect(button(host).getAttribute("aria-label")).toBe("Açık temaya geç");
  });

  it("survives a throwing localStorage and still switches the page", async () => {
    html.dataset.theme = "light";
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const host = await render(<ThemeToggle />);
    await click(button(host));
    expect(html.dataset.theme).toBe("dark");
    expect(button(host).getAttribute("aria-label")).toBe("Açık temaya geç");
  });

  it("follows another tab through the storage event", async () => {
    html.dataset.theme = "light";
    const host = await render(<ThemeToggle />);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: "dark",
        })
      );
    });
    expect(html.dataset.theme).toBe("dark");
    expect(button(host).getAttribute("aria-label")).toBe("Açık temaya geç");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null })
      );
    });
    expect(html.dataset.theme).toBe("light");
    expect(button(host).getAttribute("aria-label")).toBe("Koyu temaya geç");
  });

  it("ignores the storage events of other keys", async () => {
    html.dataset.theme = "light";
    await render(<ThemeToggle />);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "other", newValue: "dark" })
      );
    });
    expect(html.dataset.theme).toBe("light");
  });

  it("follows a storage clear from another tab back to light", async () => {
    html.dataset.theme = "dark";
    const host = await render(<ThemeToggle />);
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(html.dataset.theme).toBe("light");
    expect(button(host).getAttribute("aria-label")).toBe("Koyu temaya geç");
  });

  it("stops listening when it unmounts", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    await render(<ThemeToggle />);
    await cleanup();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});
