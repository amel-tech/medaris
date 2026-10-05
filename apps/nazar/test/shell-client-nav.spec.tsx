import { ToastProvider } from "@medaris/ui/mds/toast";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildScopes } from "~/features/shell/scope";
import { assignment, medrese } from "./fixtures";
import { html, translatorFor } from "./server-render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/medrese/m-1",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => translatorFor(namespace),
}));
// `next/link` stands for the client router: its anchors carry a marker. A plain
// `<a>` is a full document load, which streams the root loading page (the whole
// shell in skeletons, sidebar included) on every click (MDRS-258).
vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a data-client-nav="" {...props} />
  ),
}));

const renderFrame = async () => {
  const { PortalFrame } = await import(
    "~/features/shell/components/portal-frame"
  );
  const scopes = buildScopes([medrese(), assignment({ scopeId: "c-1" })]);
  return html(
    <ToastProvider>
      <PortalFrame
        person={{ name: "Mehmet Emin Işıkoğlu", email: "mehmet@example.com" }}
        roles={["MEDRESE_BASMUDERRIS"]}
        scopes={scopes}
        current={scopes[0] ?? null}
        counts={{ unread: 3 }}
      >
        <p>içerik</p>
      </PortalFrame>
    </ToastProvider>
  );
};

const anchors = (markup: string, className: string) =>
  [...markup.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) =>
      new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`).test(tag)
    );

describe("a click inside the shell is a client navigation (MDRS-258)", () => {
  it("draws every menu item through next/link", async () => {
    const items = anchors(await renderFrame(), "mds-nav-item");
    expect(items.length).toBeGreaterThan(5);
    expect(items.filter((tag) => !tag.includes("data-client-nav"))).toEqual([]);
  });

  it("draws the way to the account page through next/link", async () => {
    const row = anchors(await renderFrame(), "mds-nav-user");
    expect(row.length).toBeGreaterThan(0);
    expect(row.filter((tag) => !tag.includes("data-client-nav"))).toEqual([]);
  });

  it("draws the bell of the phone bar through next/link", async () => {
    const markup = await renderFrame();
    const bell = [...markup.matchAll(/<a\b[^>]*href="\/bildirimler"[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => tag.includes("mds-icon-btn"));
    expect(bell.length).toBe(1);
    expect(bell[0]).toContain("data-client-nav");
  });
});
