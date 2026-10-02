"use client";

import type { FlashcardDeckResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Icon } from "@medaris/ui/mds/icon";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { kindOf } from "../deck-model";
import { StatusBadge } from "./deck-badges";

export interface DeckHeaderProps {
  deck: FlashcardDeckResponse;
  isOwner: boolean;
  /** the reader's tag: the deck is in their collection */
  inCollection?: boolean;
  cardCount: number;
  /** the tab that is the current page */
  tab: "overview" | "cards";
  /** the buttons on the right of the title block */
  actions: ReactNode;
  /** where the breadcrumb starts when it is not Desteler: Keşfet for a visitor (design tedris/32) */
  root?: { label: string; href: string };
}

/**
 * The block every deck page opens with (design tedris/28, 29, 31): the
 * breadcrumb, the name, the badges and the meta line ("18 ezber kartı · Kelime
 * · Senin desten"), the description, the buttons, and the tabs. The owner has
 * "Genel" and "Kartlar"; a reader of somebody else's deck has no tabs, its card
 * list is the page.
 */
export function DeckHeader({
  deck,
  isOwner,
  inCollection = false,
  cardCount,
  tab,
  actions,
  root,
}: DeckHeaderProps) {
  const t = useTranslations("tedris.Decks");
  const locale = useLocale();
  const base = `/decks/${deck.id}`;
  return (
    <header className="flex flex-col gap-4">
      <Breadcrumb
        label={t("breadcrumbLabel")}
        items={[root ?? { label: t("title"), href: "/decks" }, deck.title]}
      />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-inline-0 flex-col gap-3">
          <h1 className="mds-h1" dir="auto">
            {deck.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {isOwner ? (
              <StatusBadge
                status={deck.publishStatus}
                label={
                  deck.publishStatus === "PUBLISHED"
                    ? t("statusPUBLISHED")
                    : deck.publishStatus === "PENDING"
                      ? t("statusPENDING")
                      : t("statusPRIVATE")
                }
              />
            ) : (
              <>
                {deck.isPublic ? (
                  <Badge variant="outline">{t("public")}</Badge>
                ) : null}
                {inCollection ? (
                  <Badge
                    variant="success"
                    icon={<Icon name="check" size="sm" />}
                  >
                    {t("inCollection")}
                  </Badge>
                ) : null}
              </>
            )}
            <span className="mds-caption">
              {t("cardsMeta", { count: cardCount })}
              <span className="mds-sep" aria-hidden="true">
                ·
              </span>
              {kindOf(deck) === "HADEETH"
                ? t("cardTypeHADEETH")
                : t("cardTypeVOCABULARY")}
              {isOwner ? (
                <>
                  <span className="mds-sep" aria-hidden="true">
                    ·
                  </span>
                  {t("yours")}
                </>
              ) : null}
            </span>
          </div>
          {deck.description ? (
            <p className="mds-body max-inline-measure" dir="auto">
              {deck.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      </div>
      {isOwner ? (
        <Tabs
          mode="links"
          label={t("tabsLabel")}
          value={tab}
          locale={locale}
          tabs={[
            { value: "overview", label: t("tabOverview"), href: base },
            {
              value: "cards",
              label: t("tabCards"),
              count: cardCount,
              href: `${base}/cards`,
            },
          ]}
        />
      ) : null}
    </header>
  );
}
