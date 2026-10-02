"use client";

import { cn } from "@medaris/ui/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "~/lib/i18n/navigation";

/**
 * Routes already on the unified design system (MDRS-157). They bring their own
 * `<main>` and page width, so the shell's wrapper is left off them.
 */
const ownsItsMain = (pathname: string) =>
  pathname.startsWith("/madrasahs") ||
  pathname.startsWith("/kosks") ||
  pathname.startsWith("/discover") ||
  pathname.startsWith("/my-courses") ||
  pathname.startsWith("/schedule") ||
  pathname.startsWith("/decks") ||
  pathname.startsWith("/account/calendar") ||
  pathname === "/home" ||
  /^\/courses\/[^/]+\/lessons\//.test(pathname);

/**
 * `signedIn` false: a visitor is shown only the tab that is theirs (Öğrenme,
 * the public Keşfet); Ev and Desteler are behind the sign-in (design tedris/32).
 */
export const TabView = ({
  children,
  signedIn = true,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) => {
  const t = useTranslations("tedris");
  const pathname = usePathname();

  return (
    <>
      <div data-legacy-tabs className="border-b border-b-gray-300 mb-8">
        <div className="flex gap-4 mx-auto w-full max-w-[80rem]">
          {signedIn ? (
            <Link
              href="/home"
              className={cn(
                "px-4 py-2 text-sm font-medium",
                pathname.startsWith("/home") &&
                  "text-brand-primary border-b-2 border-brand-primary"
              )}
            >
              <span>{t("TabView.home")}</span>
            </Link>
          ) : null}
          <Link
            prefetch
            href="/discover"
            className={cn(
              "px-4 py-2 text-sm font-medium",
              (pathname.startsWith("/learning") ||
                pathname.startsWith("/discover") ||
                pathname.startsWith("/my-courses") ||
                pathname.startsWith("/kosks")) &&
                "text-brand-primary border-b-2 border-brand-primary"
            )}
          >
            <span>{t("TabView.learning")}</span>
          </Link>
          {signedIn ? (
            <Link
              prefetch
              href="/decks"
              className={cn(
                "px-4 py-2 text-sm font-medium",
                pathname.startsWith("/decks") &&
                  "text-brand-primary border-b-2 border-brand-primary"
              )}
            >
              <span>{t("TabView.decks")}</span>
            </Link>
          ) : null}
        </div>
      </div>
      {ownsItsMain(pathname) ? (
        children
      ) : (
        <main className="mx-auto w-full max-w-[80rem] py-2 grow-1">
          {children}
        </main>
      )}
    </>
  );
};
