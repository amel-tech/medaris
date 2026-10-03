import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// tedris' islands mount the kit's AppProviders through LocaleAppProviders,
// which passes the route's direction on (MDRS-242).
const current = vi.hoisted(() => ({ locale: "tr" }));
vi.mock("next-intl", () => ({ useLocale: () => current.locale }));
vi.mock("@medaris/ui/mds/app-providers", () => ({
  AppProviders: ({
    children,
    direction,
  }: {
    children: ReactNode;
    direction?: string;
  }) =>
    createElement("div", { "data-direction": direction ?? "unset" }, children),
}));

const render = async (locale: string) => {
  current.locale = locale;
  const { LocaleAppProviders } = await import(
    "~/components/locale-app-providers"
  );
  return renderToStaticMarkup(
    createElement(LocaleAppProviders, { toaster: false, children: "island" })
  );
};

describe("LocaleAppProviders (MDRS-242)", () => {
  it.each([
    ["ar", "rtl"],
    ["tr", "ltr"],
    ["en", "ltr"],
  ] as const)("on /%s gives Base UI direction=%s", async (locale, dir) => {
    const html = await render(locale);
    expect(html).toContain(`data-direction="${dir}"`);
    expect(html).toContain("island");
  });
});
