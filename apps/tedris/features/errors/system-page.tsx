"use client";

import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";

/**
 * The system's faces for the pages below. A not-found or error boundary
 * replaces its segment, so the segment layouts that load them for the medrese
 * and session pages are not around it: the boundary brings its own. The
 * stylesheet comes with the locale layout (app/tedris.css, MDRS-281).
 */
export function SystemPageAssets() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
    </>
  );
}

/**
 * Where "back home" goes: the home page for a signed-in visitor, the landing
 * page `/` for one who is not (design tedris/38).
 */
export function homeHref(locale: string, signedIn: boolean): string {
  return signedIn ? `/${locale}/home` : `/${locale}`;
}

const useHomeHref = () => {
  const locale = useLocale();
  const { status } = useSession();
  return homeHref(locale, status === "authenticated");
};

/** Design tedris/38: a page that does not exist, or one the API answered 404 for. */
export function NotFoundState() {
  const t = useTranslations("tedris.SystemPages");
  const home = useHomeHref();
  return (
    <>
      <SystemPageAssets />
      <SystemState
        shell
        className="font-ui"
        title={t("notFoundTitle")}
        action={
          <Button href={home} variant="secondary">
            {t("notFoundAction")}
          </Button>
        }
      >
        {t("notFoundText")}
      </SystemState>
    </>
  );
}

export interface ForbiddenStateProps {
  /** the deck the visitor may read but not edit: names it and offers the way back */
  deck?: { id: string; name: string };
}

/**
 * Design tedris/39: a page the caller may not open. The copy follows what was
 * refused; the one case the design draws is a deck's cards (a public deck is
 * read by anyone, edited by its owner).
 */
export function ForbiddenState({ deck }: ForbiddenStateProps) {
  const t = useTranslations("tedris.SystemPages");
  const locale = useLocale();
  const home = useHomeHref();
  return (
    <>
      <SystemPageAssets />
      <SystemState
        shell
        className="font-ui"
        title={t("forbiddenTitle")}
        action={
          deck ? (
            <Button href={`/${locale}/decks/${deck.id}`} variant="secondary">
              {t("forbiddenDeckAction")}
            </Button>
          ) : (
            <Button href={home} variant="secondary">
              {t("forbiddenGenericAction")}
            </Button>
          )
        }
      >
        {deck
          ? t("forbiddenDeckText", { deck: deck.name })
          : t("forbiddenGenericText")}
      </SystemState>
    </>
  );
}

/** Design tedris/40: the segment threw. The error itself is never shown (criterion 3). */
export function ErrorState({ reset }: { reset: () => void }) {
  const t = useTranslations("tedris.SystemPages");
  return (
    <>
      <SystemPageAssets />
      <SystemState
        shell
        className="font-ui"
        title={t("errorTitle")}
        action={
          <Button variant="secondary" onClick={() => reset()}>
            {t("errorAction")}
          </Button>
        }
      >
        {t("errorText")}
      </SystemState>
    </>
  );
}
