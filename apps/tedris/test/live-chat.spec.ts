// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "./dom";

/**
 * YouTube's live chat of the stream (MDRS-229), the watch page's "Canlı
 * sohbet" panel (MDRS-285): open from the start at every width, framed for
 * this page's host, dark on a dark page, and with YouTube's own chat page one
 * link away for a sign-in the frame cannot see.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      liveChatTitle: "Canlı sohbet",
      liveChatPopout: "YouTube'da aç",
      liveChatNewTab: "(yeni sekmede açılır)",
    })[key] ?? key,
}));

const media = { wide: true, dark: false };
const listeners = new Set<() => void>();

// happy-dom would fetch every frame's address; the spec never leaves the machine.
const happyDOM = (
  globalThis as {
    happyDOM?: { settings: { disableIframePageLoading: boolean } };
  }
).happyDOM;
if (happyDOM) happyDOM.settings.disableIframePageLoading = true;

beforeEach(() => {
  media.wide = true;
  media.dark = false;
  delete document.documentElement.dataset.theme;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-color-scheme") ? media.dark : media.wide,
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
});

afterEach(async () => {
  await cleanup();
  listeners.clear();
  vi.unstubAllGlobals();
});

const STREAM = "https://www.youtube.com/live/ybHyHDBiRoE";

const mount = async () => {
  const { LiveChat } = await import("~/features/courses/components/live-chat");
  return render(createElement(LiveChat, { streamUrl: STREAM }));
};

const frame = (host: HTMLElement) =>
  host.querySelector<HTMLIFrameElement>("iframe");

describe("LiveChat", () => {
  it("is open with YouTube's chat for this page's host, with nothing to unfold", async () => {
    const host = await mount();
    expect(host.querySelector("details, summary")).toBeNull();
    expect(host.querySelector("section h2")?.textContent).toBe("Canlı sohbet");
    const src = new URL(frame(host)?.src ?? "");
    expect(src.pathname).toBe("/live_chat");
    expect(src.searchParams.get("v")).toBe("ybHyHDBiRoE");
    expect(src.searchParams.get("embed_domain")).toBe(location.hostname);
    expect(src.searchParams.has("dark_theme")).toBe(false);
  });

  it("offers the same chat as YouTube's own page in a new tab, where a sign-in the frame cannot see counts", async () => {
    const host = await mount();
    const link = [...host.querySelectorAll<HTMLAnchorElement>("a")].find((a) =>
      a.textContent?.includes("YouTube'da aç")
    );
    expect(link).toBeDefined();
    const href = new URL(link?.href ?? "");
    expect(href.origin + href.pathname).toBe(
      "https://www.youtube.com/live_chat"
    );
    expect(href.searchParams.get("is_popout")).toBe("1");
    expect(href.searchParams.get("v")).toBe("ybHyHDBiRoE");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(link?.textContent).toContain("(yeni sekmede açılır)");
    // In the header, beside the panel's title, as in the wireframe.
    expect(link?.parentElement?.querySelector("h2")?.textContent).toBe(
      "Canlı sohbet"
    );
  });

  it("is open on a phone too: the frame and the link are there from the start", async () => {
    media.wide = false;
    const host = await mount();
    expect(frame(host)?.src).toContain("/live_chat?v=ybHyHDBiRoE");
    expect(
      host.querySelector('a[href*="is_popout=1"]')?.getAttribute("target")
    ).toBe("_blank");
  });

  it("is dark on a page dark by the system, unless the page is forced light", async () => {
    media.dark = true;
    const dark = await mount();
    expect(frame(dark)?.src).toContain("dark_theme=1");
    await cleanup();

    document.documentElement.dataset.theme = "light";
    const light = await mount();
    expect(frame(light)?.src).not.toContain("dark_theme=1");
  });

  it("follows a theme switch on <html>", async () => {
    const host = await mount();
    expect(frame(host)?.src).not.toContain("dark_theme=1");
    await act(async () => {
      document.documentElement.dataset.theme = "dark";
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(frame(host)?.src).toContain("dark_theme=1");
  });
});
