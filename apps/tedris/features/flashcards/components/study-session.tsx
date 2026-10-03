"use client";

import type {
  FlashcardResponse,
  ReviewRating,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Progress } from "@medaris/ui/mds/progress";
import { useToaster } from "@medaris/ui/mds/toast";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { rateFlashcard } from "../actions";
import { cardStatus } from "../deck-model";
import { RATINGS, roundPercent, subtitleKind } from "../study-model";
import { CardFace } from "./card-face";
import { CardStatusBadge } from "./deck-badges";

export interface StudySessionProps {
  deck: { id: string; title: string };
  /** the round's cards, in the order they come: due first, then new */
  cards: FlashcardResponse[];
  dueCount: number;
  newCount: number;
  /** false for a visitor with no token: nothing is written */
  signedIn: boolean;
  /** where the breadcrumb starts: Desteler for a member, Keşfet for a visitor */
  root: { label: string; href: string };
  /** where a visitor goes to sign in and come back here */
  signInHref?: string;
}

/**
 * Çalışma (design tedris/30). The round is the queue the page was given, held
 * in state: rating a card writes its progress and moves on, and the page is not
 * re-read in between, so the cards do not shift under the talebe. A failed
 * write is a toast and the card stays where it is. A visitor with no token
 * studies the same way and nothing leaves the browser.
 */
export function StudySession({
  deck,
  cards,
  dueCount,
  newCount,
  signedIn,
  root,
  signInHref,
}: StudySessionProps) {
  const t = useTranslations("tedrisLearn.Study");
  const decks = useTranslations("tedris.Decks");
  const pub = useTranslations("tedrisLearn.PublicDeck");
  const locale = useLocale();
  const toaster = useToaster();
  const [round] = useState(cards);
  // The subtitle names the round as it began; the page is re-read after each
  // rating and its counts fall, but the round's own total does not.
  const [counts] = useState({ due: dueCount, fresh: newCount });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  const total = round.length;
  const card = round[index];
  const finished = index >= total;

  const toggle = useCallback(() => setRevealed((r) => !r), []);
  const reveal = useCallback(() => setRevealed(true), []);

  // Space turns the card over and back; the buttons below stay the way to do everything.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || finished) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select")) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finished, toggle]);

  const rate = async (rating: ReviewRating) => {
    if (!card || busy) return;
    if (!signedIn) {
      setRevealed(false);
      setIndex((i) => i + 1);
      return;
    }
    setBusy(true);
    const result = await rateFlashcard(card.id, rating);
    setBusy(false);
    if (!result.success) {
      toaster.notify({
        tone: "error",
        title: t("saveFailedTitle"),
        description: t("saveFailedText"),
      });
      return;
    }
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  const kind = total === 0 ? "all" : subtitleKind(signedIn, counts.due);
  const subtitle =
    kind === "due"
      ? t("subtitleDue", { deck: deck.title, count: counts.due })
      : kind === "new"
        ? t("subtitleNew", { deck: deck.title, count: counts.fresh })
        : t("subtitleAll", { deck: deck.title, count: total });

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <header className="flex flex-col gap-4">
        <Breadcrumb
          label={decks("breadcrumbLabel")}
          items={[
            { label: root.label, href: root.href },
            { label: deck.title, href: `/decks/${deck.id}` },
            t("title"),
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-inline-0 flex-col gap-2">
            <h1 className="mds-h1">{t("title")}</h1>
            <p className="mds-caption" dir="auto">
              {subtitle}
            </p>
          </div>
          <Button variant="ghost" href={`/decks/${deck.id}`}>
            {t("finish")}
          </Button>
        </div>
      </header>

      <div className="mx-auto flex inline-full max-inline-[40rem] flex-col gap-5">
        {!signedIn ? (
          <Alert tone="neutral">
            <p>
              {pub("note")}{" "}
              {signInHref ? (
                <Link href={signInHref} prefetch={false}>
                  {pub("signIn")}
                </Link>
              ) : null}
            </p>
          </Alert>
        ) : null}

        {total === 0 ? (
          <EmptyState
            action={
              <Button variant="outline" href={`/decks/${deck.id}`}>
                {t("backToDeck")}
              </Button>
            }
          >
            <strong className="block">{t("nothingTitle")}</strong>
            {t("nothingText")}
          </EmptyState>
        ) : finished ? (
          <EmptyState
            action={
              <Button variant="outline" href={`/decks/${deck.id}`}>
                {t("backToDeck")}
              </Button>
            }
          >
            <strong className="block">{t("doneTitle")}</strong>
            {t("doneText", { count: total })}
          </EmptyState>
        ) : (
          <>
            <Progress
              value={roundPercent(index, total)}
              label={t("round", { done: index, total })}
              showValue
              locale={locale}
            />
            <section
              className="mds-card flex flex-col gap-0 p-0"
              aria-label={t("cardOf", { n: index + 1, total })}
            >
              <div className="flex flex-col gap-6 p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="mds-caption">
                    {t("cardOf", { n: index + 1, total })}
                  </span>
                  {signedIn && card ? (
                    <CardStatusBadge
                      status={cardStatus(card)}
                      label={decks(`status${cardStatus(card)}`)}
                    />
                  ) : null}
                </div>
                {card ? (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: Space and the buttons below are the keyboard way to turn the card
                  // biome-ignore lint/a11y/noStaticElementInteractions: clicking the face turns the card (design tedris/30)
                  <div
                    className="flex min-block-40 cursor-pointer items-center justify-center py-6"
                    onClick={toggle}
                  >
                    <CardFace text={card.contentFront} size="sample" />
                  </div>
                ) : null}
                {revealed && card ? (
                  <div className="flex flex-col gap-3 border-bs border-neutral-subtle pbs-5">
                    <span className="mds-eyebrow">{decks("backLabel")}</span>
                    <p className="mds-reading" dir="auto">
                      {card.contentBack}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-bs border-neutral-subtle p-4">
                {revealed ? (
                  <>
                    <span className="mds-caption">{t("difficulty")}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {RATINGS.map(({ value, key }) => (
                        <Button
                          key={value}
                          variant="outline"
                          disabled={busy}
                          onClick={() => rate(value)}
                        >
                          {t(key)}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={reveal}
                    className="ms-auto"
                  >
                    {t("showBack")}
                  </Button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
