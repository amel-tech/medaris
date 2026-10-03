"use client";

import type {
  FlashcardDeckExploreResponse,
  FlashcardDeckSummaryResponse,
  FlashcardType,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useToaster } from "@medaris/ui/mds/toast";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { addDeckToCollection, removeDeckFromCollection } from "../actions";
import { attempt } from "../attempt";
import { matchesQuery } from "../deck-model";
import { KindBadge } from "./deck-badges";
import { type DeckCardLabels, DeckSummaryCard } from "./deck-summary-card";

export interface ExploreDecksPageProps {
  /** null when the server could not read them: the page offers a retry */
  data: FlashcardDeckExploreResponse | null;
  /** the card-type filter the address carries, or null for every type */
  cardType: FlashcardType | null;
}

const GRID =
  "grid gap-grid grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1 [&>*]:min-inline-0";
const TYPES = ["all", "VOCABULARY", "HADEETH"] as const;

/**
 * Desteleri keşfet (design tedris/26): the decks of the caller's courses and
 * the published decks, a card-type filter that the address carries (so a
 * filtered result is a link), a search box over what is shown, and "Koleksiyona
 * ekle" / "Çıkar" on each deck. Adding and removing answer at once and are
 * undone with a toast if the API refuses; a deck is busy while its request is
 * out, so a second click does nothing.
 */
export function ExploreDecksPage({ data, cardType }: ExploreDecksPageProps) {
  const t = useTranslations("tedris.Decks");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const toaster = useToaster();
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const courseId = useId();
  const publicId = useId();

  const labels: DeckCardLabels = {
    cards: (count) => t("cards", { count }),
    cardType: (kind) =>
      kind === "HADEETH" ? t("cardTypeHADEETH") : t("cardTypeVOCABULARY"),
    completed: (done, total) => t("completed", { done, total }),
    muderris: (name) => t("muderris", { name }),
  };
  const kindLabel = (kind: "COURSE" | "KOSK" | "MADRASAH" | "PUBLIC") =>
    kind === "COURSE"
      ? t("kindCOURSE")
      : kind === "KOSK"
        ? t("kindKOSK")
        : kind === "MADRASAH"
          ? t("kindMADRASAH")
          : t("kindPUBLIC");

  const inCollection = (deck: FlashcardDeckSummaryResponse) =>
    overrides[deck.id] ?? deck.inCollection;

  const toggle = async (deck: FlashcardDeckSummaryResponse, next: boolean) => {
    if (busy.has(deck.id)) return;
    const before = inCollection(deck);
    setBusy((s) => new Set(s).add(deck.id));
    setOverrides((o) => ({ ...o, [deck.id]: next }));
    const result = await attempt(() =>
      next ? addDeckToCollection(deck.id) : removeDeckFromCollection(deck.id)
    );
    setBusy((s) => {
      const rest = new Set(s);
      rest.delete(deck.id);
      return rest;
    });
    if (result.success) {
      router.refresh();
      return;
    }
    setOverrides((o) => ({ ...o, [deck.id]: before }));
    toaster.notify({
      tone: "error",
      title: t(next ? "addFailedTitle" : "removeFailedTitle"),
      description: t("tryAgain"),
    });
  };

  const changeType = (value: string | null) => {
    const type = value && value !== "all" ? value : null;
    router.push(type ? `${pathname}?type=${type}` : pathname);
  };

  const shell = (children: React.ReactNode) => (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      {children}
    </main>
  );

  if (!data) {
    return shell(
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
    );
  }

  const courseDecks = data.courseDecks.filter((d) =>
    matchesQuery(d, query, locale)
  );
  const publicDecks = data.publicDecks.filter((d) =>
    matchesQuery(d, query, locale)
  );

  const actionsOf = (deck: FlashcardDeckSummaryResponse) => {
    if (deck.isMine) return <span className="mds-caption">{t("yours")}</span>;
    const isBusy = busy.has(deck.id);
    if (inCollection(deck)) {
      return (
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant="success" icon={<Icon name="check" size="sm" />}>
            {t("inCollection")}
          </Badge>
          <Button
            variant="ghost"
            size="mini"
            loading={isBusy}
            aria-label={t("removeLabel", { title: deck.title })}
            onClick={() => toggle(deck, false)}
          >
            {t("remove")}
          </Button>
        </span>
      );
    }
    return (
      <Button
        variant="outline"
        size="small"
        iconLeft={<Icon name="plus" />}
        loading={isBusy}
        aria-label={t("addLabel", { title: deck.title })}
        onClick={() => toggle(deck, true)}
      >
        {t("add")}
      </Button>
    );
  };

  const section = (
    id: string,
    title: string,
    hint: string,
    decks: FlashcardDeckSummaryResponse[],
    empty: string,
    withKind: boolean
  ) => (
    <section className="flex flex-col gap-5" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="mds-h2" id={id}>
          {title}
        </h2>
        <span className="mds-caption">
          {t("deckCount", { count: decks.length })}
        </span>
      </div>
      <p className="mds-body-sm max-inline-measure">{hint}</p>
      {decks.length === 0 ? (
        <EmptyState icon={<Icon name="cards" size="lg" />}>{empty}</EmptyState>
      ) : (
        <ul className={GRID} aria-labelledby={id}>
          {decks.map((deck) => (
            <li key={deck.id} className="flex">
              <DeckSummaryCard
                deck={deck}
                labels={labels}
                showProgress={deck.isMine || inCollection(deck)}
                badge={
                  withKind && deck.collectionKind ? (
                    <KindBadge
                      kind={deck.collectionKind}
                      label={kindLabel(deck.collectionKind)}
                    />
                  ) : null
                }
                actions={actionsOf(deck)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const searching = query.trim() !== "";
  return shell(
    <>
      <div className="flex flex-col gap-3">
        <Breadcrumb
          label={t("breadcrumbLabel")}
          items={[{ label: t("title"), href: "/decks" }, t("explore")]}
        />
        <h1 className="mds-h1">{t("explore")}</h1>
        <p className="mds-body-sm max-inline-measure">{t("exploreSubtitle")}</p>
      </div>

      <search className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="inline-full max-inline-measure">
          <Input
            type="search"
            name="q"
            aria-label={t("searchByName")}
            placeholder={t("searchByName")}
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            leading={<Icon name="search" />}
          />
        </div>
        <ChoiceChips
          legend={t("kindLegend")}
          value={cardType ?? "all"}
          onChange={changeType}
          options={TYPES.map((value) => ({
            value,
            label:
              value === "all"
                ? t("all")
                : value === "VOCABULARY"
                  ? t("cardTypeVOCABULARY")
                  : t("cardTypeHADEETH"),
          }))}
        />
      </search>

      {section(
        courseId,
        t("courseTitle"),
        t("courseHint"),
        courseDecks,
        searching ? t("emptySearch") : t("emptyCourse"),
        true
      )}
      {section(
        publicId,
        t("publicTitle"),
        t("publicHint"),
        publicDecks,
        searching ? t("emptySearch") : t("emptyPublic"),
        false
      )}
    </>
  );
}
