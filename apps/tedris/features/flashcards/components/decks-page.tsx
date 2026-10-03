"use client";

import type { FlashcardDeckSummaryResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  filterMyDecks,
  MY_DECK_FILTERS,
  type MyDeckFilter,
  matchesQuery,
  splitDecks,
} from "../deck-model";
import { KindBadge, StatusBadge } from "./deck-badges";
import {
  type DeckCardLabels,
  DeckSummaryCard,
  StudyButton,
} from "./deck-summary-card";

export interface DecksPageProps {
  /** null when the server could not read them: the page offers a retry */
  decks: FlashcardDeckSummaryResponse[] | null;
}

const GRID =
  "grid gap-grid grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1 [&>*]:min-inline-0";

/**
 * Desteler (design tedris/25): the caller's own decks under "Destelerim", with
 * a filter by publishing status and a search box, and the decks of others they
 * collected under "Koleksiyonum". Both lists come from one request
 * (`GET /flashcard/decks/summary`); the filter and the search work on what is
 * already here.
 */
export function DecksPage({ decks }: DecksPageProps) {
  const t = useTranslations("tedris.Decks");
  const locale = useLocale();
  const router = useRouter();
  const [filter, setFilter] = useState<MyDeckFilter>("all");
  const [query, setQuery] = useState("");
  const mineId = useId();
  const collectionId = useId();
  const labels: DeckCardLabels = {
    cards: (count) => t("cards", { count }),
    cardType: (kind) =>
      kind === "HADEETH" ? t("cardTypeHADEETH") : t("cardTypeVOCABULARY"),
    completed: (done, total) => t("completed", { done, total }),
    due: (count) => t("dueCount", { count }),
    added: (count) => t("added", { count }),
    requested: (when) => t("requested", { when }),
    muderris: (name) => t("muderris", { name }),
  };
  const statusLabel = (
    status: "PRIVATE" | "PENDING" | "PUBLISHED" | "REJECTED"
  ) =>
    status === "PUBLISHED"
      ? t("statusPUBLISHED")
      : status === "PENDING"
        ? t("statusPENDING")
        : status === "REJECTED"
          ? t("statusREJECTED")
          : t("statusPRIVATE");
  const kindLabel = (kind: "COURSE" | "KOSK" | "MADRASAH" | "PUBLIC") =>
    kind === "COURSE"
      ? t("kindCOURSE")
      : kind === "KOSK"
        ? t("kindKOSK")
        : kind === "MADRASAH"
          ? t("kindMADRASAH")
          : t("kindPUBLIC");
  const study = (deck: FlashcardDeckSummaryResponse) => (
    <StudyButton
      deckId={deck.id}
      label={t("study")}
      accessibleLabel={t("studyLabel", { title: deck.title })}
    />
  );

  if (!decks) {
    return (
      <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <SystemState
          shell
          headingLevel={2}
          title={t("errorTitle")}
          action={
            <Button variant="outline" onClick={() => router.refresh()}>
              {t("retry")}
            </Button>
          }
        >
          {t("errorText")}
        </SystemState>
      </main>
    );
  }

  const { mine, collected } = splitDecks(decks);
  const shownMine = filterMyDecks(mine, filter, query, locale);
  const shownCollected = collected.filter((d) =>
    matchesQuery(d, query, locale)
  );
  const searching = query.trim() !== "";

  const mineEmpty =
    mine.length === 0
      ? t("emptyMine")
      : searching
        ? t("emptySearch")
        : t("emptyFilter");

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-inline-0 flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p className="mds-body-sm">{t("listSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            href="/decks/explore"
            variant="outline"
            iconLeft={<Icon name="search" />}
          >
            {t("explore")}
          </Button>
          <Button href="/decks/create" iconLeft={<Icon name="plus" />}>
            {t("create")}
          </Button>
        </div>
      </div>

      <search className="max-inline-measure">
        <Input
          type="search"
          name="q"
          aria-label={t("searchDecks")}
          placeholder={t("searchDecks")}
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          leading={<Icon name="search" />}
        />
      </search>

      <section className="flex flex-col gap-5" aria-labelledby={mineId}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="mds-h2" id={mineId}>
            {t("mineTitle")}
          </h2>
          <span className="mds-caption">
            {t("deckCount", { count: shownMine.length })}
          </span>
        </div>
        <p className="mds-body-sm max-inline-measure">{t("mineHint")}</p>
        <ChoiceChips
          legend={t("filterLabel")}
          value={filter}
          onChange={(value) => setFilter((value as MyDeckFilter) ?? "all")}
          options={MY_DECK_FILTERS.map((value) => ({
            value,
            label:
              value === "all"
                ? t("all")
                : value === "PRIVATE"
                  ? t("statusPRIVATE")
                  : value === "PENDING"
                    ? t("statusPENDING")
                    : t("statusPUBLISHED"),
          }))}
        />
        {shownMine.length === 0 ? (
          <EmptyState
            icon={<Icon name="cards" size="lg" />}
            action={
              mine.length === 0 ? (
                <Button href="/decks/create" iconLeft={<Icon name="plus" />}>
                  {t("create")}
                </Button>
              ) : undefined
            }
          >
            {mineEmpty}
          </EmptyState>
        ) : (
          <ul className={GRID} aria-label={t("decksLabel")}>
            {shownMine.map((deck) => (
              <li key={deck.id} className="flex">
                <DeckSummaryCard
                  deck={deck}
                  labels={labels}
                  own
                  badge={
                    <StatusBadge
                      status={deck.publishStatus}
                      label={statusLabel(deck.publishStatus)}
                    />
                  }
                  actions={study(deck)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-5" aria-labelledby={collectionId}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="mds-h2" id={collectionId}>
            {t("collectionTitle")}
          </h2>
          <span className="mds-caption">
            {t("deckCount", { count: shownCollected.length })}
          </span>
        </div>
        <p className="mds-body-sm max-inline-measure">{t("collectionHint")}</p>
        {shownCollected.length === 0 ? (
          <EmptyState
            icon={<Icon name="cards" size="lg" />}
            action={
              collected.length === 0 ? (
                <Button
                  href="/decks/explore"
                  variant="outline"
                  iconLeft={<Icon name="search" />}
                >
                  {t("explore")}
                </Button>
              ) : undefined
            }
          >
            {collected.length === 0 ? t("emptyCollection") : t("emptySearch")}
          </EmptyState>
        ) : (
          <ul className={GRID} aria-label={t("collectionLabel")}>
            {shownCollected.map((deck) => (
              <li key={deck.id} className="flex">
                <DeckSummaryCard
                  deck={deck}
                  labels={labels}
                  badge={
                    deck.collectionKind ? (
                      <KindBadge
                        kind={deck.collectionKind}
                        label={kindLabel(deck.collectionKind)}
                      />
                    ) : null
                  }
                  actions={study(deck)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
