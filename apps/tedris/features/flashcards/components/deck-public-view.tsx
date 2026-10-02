"use client";

import type {
  FlashcardDeckResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Table } from "@medaris/ui/mds/table";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  countCards,
  countOf,
  READER_PAGE,
  showMore,
  sourceOf,
} from "../deck-model";
import { CardFace } from "./card-face";
import { DeckHeader } from "./deck-header";

/**
 * The page of a public deck for a visitor with no token (design tedris/32): the
 * deck and its cards six at a time, "Çalış" without saving anything, and the
 * way to sign in and come back to this deck. There is no collection, copy or
 * progress here: all of those are somebody's.
 */
export function DeckPublicView({
  deck,
  cards,
  signInHref,
}: {
  deck: FlashcardDeckResponse;
  cards: FlashcardResponse[];
  /** sign in, returning to this deck */
  signInHref: string;
}) {
  const t = useTranslations("tedris.Decks");
  const locale = useLocale();
  const pub = useTranslations("tedrisLearn.PublicDeck");
  const discover = useTranslations("tedris.PhoneMenu");
  const [shown, setShown] = useState(Math.min(cards.length, READER_PAGE));
  const total = countCards(cards).total;
  const visible = cards.slice(0, shown);

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <DeckHeader
        deck={deck}
        isOwner={false}
        cardCount={total}
        tab="cards"
        root={{ label: discover("discover"), href: "/discover" }}
        actions={
          <Button
            href={`/decks/study/${deck.id}`}
            size="large"
            iconLeft={<Icon name="play" />}
          >
            {t("study")}
          </Button>
        }
      />

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex min-inline-0 flex-col gap-6">
          <Alert tone="neutral">
            <p>
              {pub("note")}{" "}
              <Link href={signInHref} prefetch={false}>
                {pub("signIn")}
              </Link>
            </p>
          </Alert>
          <section
            className="flex min-inline-0 flex-col gap-4"
            aria-labelledby="deck-cards"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="mds-h2" id="deck-cards">
                {t("tabCards")}
              </h2>
              <span className="mds-caption">
                {t("cards", { count: total })}
              </span>
            </div>
            {cards.length === 0 ? (
              <EmptyState icon={<Icon name="cards" size="lg" />}>
                {t("emptyCards")}
              </EmptyState>
            ) : (
              <>
                <Table
                  caption={t("tableCaption", { title: deck.title })}
                  responsive="stack"
                  rows={visible}
                  rowKey={(card) => card.id}
                  columns={[
                    {
                      key: "front",
                      header: t("frontLabel"),
                      width: "30%",
                      render: (card) => <CardFace text={card.contentFront} />,
                    },
                    {
                      key: "back",
                      header: t("backLabel"),
                      render: (card) => (
                        <>
                          <span className="block" dir="auto">
                            {card.contentBack}
                          </span>
                          {sourceOf(card) ? (
                            <span className="mds-caption block" dir="auto">
                              {sourceOf(card)}
                            </span>
                          ) : null}
                        </>
                      ),
                    },
                  ]}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="mds-caption">
                    {t("showing", {
                      shown: visible.length,
                      shownText: countOf(visible.length, locale),
                      total,
                    })}
                  </p>
                  {shown < cards.length ? (
                    <Button
                      variant="secondary"
                      onClick={() => setShown(showMore(shown, cards.length))}
                    >
                      {t("loadMore")}
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="flex min-inline-0 flex-col gap-5">
          <section className="mds-card flex flex-col gap-3">
            <h2 className="mds-h3">{t("aboutTitle")}</h2>
            <p className="mds-body-sm">{t("aboutPublic")}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
