"use client";

import type {
  FlashcardDeckResponse,
  FlashcardDeckSummaryResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Progress } from "@medaris/ui/mds/progress";
import { Table } from "@medaris/ui/mds/table";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { addDeckToCollection, removeDeckFromCollection } from "../actions";
import { attempt } from "../attempt";
import {
  countCards,
  countOf,
  percentOf,
  READER_PAGE,
  showMore,
  sourceOf,
} from "../deck-model";
import { CardFace } from "./card-face";
import { CopyCardDialog } from "./copy-card-dialog";
import { DeckHeader } from "./deck-header";

/**
 * The page of a deck somebody else wrote (design tedris/31): its cards six at
 * a time with "Kendi desteme kopyala" on each, the caller's progress, and what
 * kind of deck it is. There is no edit control on it; the API would answer 403
 * to one. A deck the caller has not collected offers "Koleksiyona ekle".
 */
export function DeckReaderView({
  deck,
  cards,
  inCollection,
  ownDecks,
}: {
  deck: FlashcardDeckResponse;
  cards: FlashcardResponse[];
  inCollection: boolean;
  ownDecks: FlashcardDeckSummaryResponse[];
}) {
  const t = useTranslations("tedris.Decks");
  const locale = useLocale();
  const router = useRouter();
  const toaster = useToaster();
  const [shown, setShown] = useState(Math.min(cards.length, READER_PAGE));
  const [collected, setCollected] = useState(inCollection);
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);

  const counts = countCards(cards);
  const visible = cards.slice(0, shown);
  const sameKind = ownDecks.filter((d) => d.cardType === deck.cardType);

  const toggleCollection = async () => {
    if (busy) return;
    const next = !collected;
    setBusy(true);
    setCollected(next);
    const result = await attempt(() =>
      next ? addDeckToCollection(deck.id) : removeDeckFromCollection(deck.id)
    );
    setBusy(false);
    if (result.success) {
      router.refresh();
      return;
    }
    setCollected(!next);
    toaster.notify({
      tone: "error",
      title: t(next ? "addFailedTitle" : "removeFailedTitle"),
      description: t("tryAgain"),
    });
  };

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <DeckHeader
        deck={deck}
        isOwner={false}
        inCollection={collected}
        cardCount={counts.total}
        tab="cards"
        actions={
          <>
            <Button
              variant="outline"
              size="large"
              loading={busy}
              iconLeft={collected ? undefined : <Icon name="plus" />}
              onClick={toggleCollection}
            >
              {collected ? t("removeFromCollection") : t("add")}
            </Button>
            <Button
              href={`/decks/study/${deck.id}`}
              iconLeft={<Icon name="play" />}
            >
              {t("study")}
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <section
          className="flex min-inline-0 flex-col gap-4"
          aria-labelledby="deck-cards"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="mds-h2" id="deck-cards">
              {t("tabCards")}
            </h2>
            <span className="mds-caption">
              {t("cards", { count: counts.total })}
            </span>
          </div>
          <p className="mds-body-sm max-inline-measure">{t("readerNote")}</p>
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
                    rowHeader: true,
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
                  {
                    key: "actions",
                    header: (
                      <span className="mds-visually-hidden">
                        {t("actionsCol")}
                      </span>
                    ),
                    align: "right",
                    render: (_card, index) => (
                      <Button
                        variant="outline"
                        size="small"
                        iconLeft={<Icon name="copy" />}
                        aria-label={t("copyLabel", { n: index + 1 })}
                        onClick={() => setCopying(index)}
                      >
                        {t("copy")}
                      </Button>
                    ),
                  },
                ]}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="mds-caption">
                  {t("showing", {
                    shown: visible.length,
                    shownText: countOf(visible.length, locale),
                    total: counts.total,
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

        <aside className="flex min-inline-0 flex-col gap-5">
          <section className="mds-card flex flex-col gap-3">
            <h2 className="mds-h3">{t("progressTitle")}</h2>
            <Progress
              value={percentOf(counts.mastered, counts.total)}
              label={t("completed", {
                done: counts.mastered,
                total: counts.total,
              })}
              showValue
              locale={locale}
            />
          </section>
          <section className="mds-card flex flex-col gap-3">
            <h2 className="mds-h3">{t("aboutTitle")}</h2>
            <p className="mds-body-sm">
              {t(deck.isPublic ? "aboutPublic" : "aboutShared")}
            </p>
          </section>
        </aside>
      </div>

      {copying !== null && visible[copying] ? (
        <CopyCardDialog
          card={visible[copying]}
          cardNumber={copying + 1}
          ownDecks={sameKind}
          onClose={() => setCopying(null)}
        />
      ) : null}
    </main>
  );
}
