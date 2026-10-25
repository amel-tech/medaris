"use client";

import type { FlashcardResponse } from "@medaris/services/tedrisat";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { isArabic } from "../../flashcards/deck-model";

const LATIN = /[A-Za-zÀ-ɏ]/;

/**
 * One card that turns over on a press. The front (the Arabic) sits on the
 * brand's bold fill, the back (the meaning) on a plain sheet, so the side in
 * view is told by colour, not by a label; "Ön yüz" / "Arka yüz" stays only for
 * assistive technology. The face turned away is hidden from it, so the
 * button's name is always the side in view, side included. It is a plain
 * button, not a toggle: a toggle's name must not change when it is pressed.
 *
 * The turn is a Y rotation of two and a half `--duration-base`, the card lifted
 * and shadowed while it turns (`data-turning`). The global reduced-motion rule
 * of `@medaris/tokens` cuts the transition to an instant change.
 *
 * Both faces sit in the same grid cell rather than on top of each other by
 * absolute position, so the card is as tall as its longer face and a long
 * answer is never cut off or scrolled inside a button.
 */
export const DeckFlipCard = ({
  card,
  turned,
  onTurn,
  describedBy,
  compact = false,
}: {
  card: FlashcardResponse;
  turned: boolean;
  onTurn: () => void;
  describedBy?: string;
  /** A sîga table's cell: a shorter card, the row and column say the rest. */
  compact?: boolean;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const [turning, setTurning] = useState(false);

  // transitionend clears the lift; this is the fallback for a transition that
  // never ran (reduced motion in some engines, a card unmounted mid-turn).
  useEffect(() => {
    if (!turning) return;
    const id = setTimeout(() => setTurning(false), 700);
    return () => clearTimeout(id);
  }, [turning]);

  return (
    <button
      type="button"
      aria-describedby={describedBy}
      data-card-id={card.id}
      data-turned={turned || undefined}
      data-turning={turning || undefined}
      onClick={() => {
        setTurning(true);
        onTurn();
      }}
      className="group flex inline-full grow cursor-pointer rounded-[var(--radius-surface)] border-0 bg-transparent p-0 perspective-[60rem] [transition:scale_var(--duration-base)_var(--ease-standard)] data-[turning]:scale-[1.04]"
    >
      <span
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "transform"
          )
            setTurning(false);
        }}
        className={[
          "grid inline-full grow transform-3d [transition:transform_calc(var(--duration-base)*2.5)_var(--ease-standard)]",
          compact ? "min-block-[4.5rem]" : "min-block-[7.5rem]",
          turned ? "rotate-y-180" : "",
        ].join(" ")}
      >
        <Face
          side={t("deckGridFront")}
          text={card.contentFront}
          hidden={turned}
        />
        <Face
          side={t("deckGridBack")}
          text={card.contentBack}
          hidden={!turned}
          back
        />
      </span>
    </button>
  );
};

const Face = ({
  side,
  text,
  hidden,
  back = false,
}: {
  /** "Ön yüz" / "Arka yüz": read before the text, never shown. */
  side: string;
  text: string;
  hidden: boolean;
  back?: boolean;
}) => {
  // A face all in Arabic script sets as an Arabic block; a Latin text that
  // quotes an Arabic word keeps its own direction (`dir="auto"`), so the
  // Latin words do not run right to left.
  const arabic = isArabic(text) && !LATIN.test(text);
  return (
    <span
      aria-hidden={hidden}
      className={[
        "flex items-center justify-center rounded-[var(--radius-surface)] border p-3 backface-hidden [grid-area:1/1] [transition:box-shadow_var(--duration-base)_var(--ease-standard)] group-data-[turning]:shadow-overlay",
        back
          ? "rotate-y-180 border-neutral-subtle bg-neutral-surface text-neutral-default"
          : "border-brand-default bg-brand-bold text-neutral-on-bold",
      ].join(" ")}
    >
      <span className="mds-visually-hidden">{side}</span>
      {arabic ? (
        <span
          className="font-arabic text-center text-[length:var(--fs-arabic)] leading-[var(--lh-arabic-text)]"
          dir="rtl"
          lang="ar"
        >
          {text}
        </span>
      ) : (
        // Not `.mds-body-sm`: it sets its own text colour, which would put
        // dark text on the front's bold fill.
        <span
          className="font-ui text-body-sm leading-ui text-center"
          dir="auto"
        >
          {text}
        </span>
      )}
    </span>
  );
};
