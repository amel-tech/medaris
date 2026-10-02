"use client";

import type {
  FlashcardDeckResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Progress } from "@medaris/ui/mds/progress";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import {
  deleteDeck,
  requestDeckPublication,
  withdrawDeckPublication,
} from "../actions";
import { attempt } from "../attempt";
import {
  atTime,
  cardStatus,
  countCards,
  fullDateTime,
  percentOf,
  SAMPLE_CARDS,
} from "../deck-model";
import { CardFace } from "./card-face";
import { CardStatusBadge } from "./deck-badges";

/**
 * The owner's "Genel" tab (design tedris/28): their progress through the
 * deck, the first cards, who can see the deck (with the publication request),
 * and the deck's own actions. The counts come from the cards' progress rows, so
 * new + learning + mastered is always the number of cards.
 */
export function DeckOwnerOverview({
  deck,
  cards,
}: {
  deck: FlashcardDeckResponse;
  cards: FlashcardResponse[];
}) {
  const t = useTranslations("tedris.Decks");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const toaster = useToaster();
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const counts = countCards(cards);
  const pct = percentOf(counts.mastered, counts.total);

  const changePublication = async (kind: "request" | "withdraw") => {
    if (publishing) return;
    setPublishing(true);
    const result =
      kind === "request"
        ? await attempt(() => requestDeckPublication(deck.id))
        : await attempt(() => withdrawDeckPublication(deck.id));
    setPublishing(false);
    if (!result.success) {
      toaster.notify({
        tone: "error",
        title: t(
          kind === "request" ? "publishFailedTitle" : "withdrawFailedTitle"
        ),
        description: t("tryAgain"),
      });
      return;
    }
    toaster.notify({
      tone: "success",
      title: t(kind === "request" ? "requestedTitle" : "withdrawnTitle"),
    });
    router.refresh();
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    const result = await attempt(() => deleteDeck(deck.id));
    if (result.success) {
      router.push("/decks");
      return;
    }
    setDeleting(false);
    setConfirmOpen(false);
    toaster.notify({
      tone: "error",
      title: t("deleteFailedTitle"),
      description: t("tryAgain"),
    });
  };

  const requestedAt = deck.publishRequestedAt
    ? fullDateTime(new Date(deck.publishRequestedAt), locale, timeZone)
    : null;
  const who =
    deck.publishStatus === "PENDING" && requestedAt
      ? t("whoPENDING", { when: requestedAt, at: atTime(requestedAt, locale) })
      : deck.publishStatus === "PUBLISHED"
        ? t("whoPUBLISHED")
        : t("whoPRIVATE");
  const cardStatusLabel = (status: "NEW" | "LEARNING" | "MASTERED") =>
    status === "MASTERED"
      ? t("statusMASTERED")
      : status === "LEARNING"
        ? t("statusLEARNING")
        : t("statusNEW");

  return (
    <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
      <div className="flex min-inline-0 flex-col gap-8">
        <section className="mds-card flex flex-col gap-4">
          <h2 className="mds-h3">{t("progressTitle")}</h2>
          <Progress
            value={pct}
            label={t("completed", {
              done: counts.mastered,
              total: counts.total,
            })}
            showValue
            locale={locale}
          />
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {(
              [
                ["NEW", counts.new],
                ["LEARNING", counts.learning],
                ["MASTERED", counts.mastered],
              ] as const
            ).map(([status, count]) => (
              <li key={status} className="flex items-center gap-2">
                <CardStatusBadge
                  status={status}
                  label={cardStatusLabel(status)}
                />
                <span className="mds-body-sm">{t("cards", { count })}</span>
              </li>
            ))}
          </ul>
          {counts.learning > 0 ? (
            <p className="mds-body-sm">
              {t("dueToday", { count: counts.learning })}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="deck-samples">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="mds-h2" id="deck-samples">
              {t("samplesTitle")}
            </h2>
            {cards.length > 0 ? (
              <Button
                href={`/decks/${deck.id}/cards`}
                variant="link"
                size="small"
              >
                {t("allCards")}
              </Button>
            ) : null}
          </div>
          {cards.length === 0 ? (
            <EmptyState
              icon={<Icon name="cards" size="lg" />}
              action={
                <Button
                  href={`/decks/${deck.id}/cards`}
                  iconLeft={<Icon name="plus" />}
                >
                  {t("addCard")}
                </Button>
              }
            >
              {t("emptyCards")}
            </EmptyState>
          ) : (
            <ul className="grid gap-grid grid-cols-2 max-md:grid-cols-1">
              {cards.slice(0, SAMPLE_CARDS).map((card, index) => (
                <li key={card.id} className="mds-card flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="mds-caption">
                      {t("cardN", { n: index + 1 })}
                    </span>
                    <CardStatusBadge
                      status={cardStatus(card)}
                      label={cardStatusLabel(cardStatus(card))}
                    />
                  </div>
                  <CardFace text={card.contentFront} size="sample" />
                  <hr className="mds-separator" />
                  <p className="mds-body-sm" dir="auto">
                    {card.contentBack}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex min-inline-0 flex-col gap-5">
        <section className="mds-card flex flex-col gap-3">
          <h2 className="mds-h3">{t("whoTitle")}</h2>
          <p className="mds-body-sm">{who}</p>
          <div>
            {deck.publishStatus === "PRIVATE" ? (
              <Button
                variant="outline"
                loading={publishing}
                onClick={() => changePublication("request")}
              >
                {t("requestPublish")}
              </Button>
            ) : (
              <Button
                variant="outline"
                loading={publishing}
                onClick={() => changePublication("withdraw")}
              >
                {t(
                  deck.publishStatus === "PENDING"
                    ? "withdrawRequest"
                    : "makePrivate"
                )}
              </Button>
            )}
          </div>
        </section>
        <section className="mds-card flex flex-col gap-3">
          <h2 className="mds-h3">{t("deckTitle")}</h2>
          <p className="mds-body-sm">{t("deckText")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              href={`/decks/${deck.id}/edit`}
              variant="secondary"
              iconLeft={<Icon name="edit" />}
            >
              {t("edit")}
            </Button>
            <Button
              variant="ghost"
              iconLeft={<Icon name="trash" />}
              onClick={() => setConfirmOpen(true)}
            >
              {t("delete")}
            </Button>
            <AlertDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              eyebrow={<span dir="auto">{deck.title}</span>}
              title={t("deleteTitle")}
              confirmLabel={t("delete")}
              confirmVariant="destructive"
              confirmLoading={deleting}
              onConfirm={remove}
            >
              {t("deleteText", { title: deck.title, count: counts.total })}
            </AlertDialog>
          </div>
        </section>
      </aside>
    </div>
  );
}
