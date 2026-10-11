// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "./dom";

/**
 * YouTube's live chat under the stream (MDRS-229): open on a wide window and
 * closed on a phone, framed for this page's host, and dark on a dark page.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      liveChatTitle: "Canlı sohbet",
      liveChatShow: "Sohbeti göster",
      liveChatHide: "Gizle",
      liveChatText: "Sohbet YouTube'dan gelir.",
      liveChatPopout: "Sohbeti YouTube'da aç",
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
  it("opens on a wide window with YouTube's chat for this page's host", async () => {
    const host = await mount();
    expect(host.querySelector("details")?.open).toBe(true);
    const src = new URL(frame(host)?.src ?? "");
    expect(src.pathname).toBe("/live_chat");
    expect(src.searchParams.get("v")).toBe("ybHyHDBiRoE");
    expect(src.searchParams.get("embed_domain")).toBe(location.hostname);
    expect(src.searchParams.has("dark_theme")).toBe(false);
  });

  it("offers the same chat as YouTube's own page in a new tab, where a sign-in the frame cannot see counts", async () => {
    const host = await mount();
    const link = [...host.querySelectorAll<HTMLAnchorElement>("a")].find((a) =>
      a.textContent?.includes("Sohbeti YouTube'da aç")
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
  });

  it("waits closed on a phone, with no frame until it is opened", async () => {
    media.wide = false;
    const host = await mount();
    expect(host.querySelector("details")?.open).toBe(false);
    expect(frame(host)).toBeNull();
    expect(host.textContent).toContain("Sohbeti göster");
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
