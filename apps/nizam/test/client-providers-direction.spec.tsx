import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ClientProviders without the session, the auth watchers and the toasters:
// only what it hands the kit's AppProviders is left (MDRS-242).
const current = vi.hoisted(() => ({ locale: "tr" }));
vi.mock("next-intl", () => ({
  useLocale: () => current.locale,
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/kosks" }));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@medaris/services/auth-client", () => ({
  KeycloakSessionWatch: () => null,
  RefreshErrorRedirect: () => null,
}));
vi.mock("@medaris/ui/components/sonner", () => ({
  DismissStaleSonnerToasts: () => null,
  Toaster: () => null,
}));
vi.mock("~/components/providers/time-zone-sync", () => ({
  TimeZoneSync: () => null,
}));
vi.mock("@medaris/ui/mds/app-providers", () => ({
  AppProviders: ({
    children,
    direction,
  }: {
    children: ReactNode;
    direction?: string;
  }) => <div data-direction={direction ?? "unset"}>{children}</div>,
}));

const render = async (locale: string) => {
  current.locale = locale;
  const { ClientProviders } = await import(
    "~/components/providers/client-providers"
  );
  return renderToStaticMarkup(<ClientProviders>page</ClientProviders>);
};

describe("ClientProviders hands Base UI the route's direction (MDRS-242)", () => {
  it.each([
    ["ar", "rtl"],
    ["tr", "ltr"],
    ["en", "ltr"],
  ] as const)("on /%s: direction=%s", async (locale, dir) => {
    expect(await render(locale)).toContain(`data-direction="${dir}"`);
  });
});
