/**
 * The sarf page's own rules: what a saved root is, and the cards a table or
 * the twenty-four become when the müderris adds them to a deck. The sîgas
 * themselves come from `@medaris/sarf`.
 */

import {
  type BabKey,
  type CekimTablosu,
  cekimDrafts,
  isBabKey,
  MASDAR_VEZINS,
  type MasdarVezin,
  type MuhtelifeSatir,
  type Sarf,
} from "@medaris/sarf";
import type { CardBody } from "../decks/actions";
import { type CardType, FACE_MAX, FACE_MIN } from "../decks/decks";

/** A root the course's müderris put on its sarf page. */
export interface SarfRootFact {
  id: string;
  kok: string;
  bab: BabKey;
  mastar: string | null;
  masdarVezin: MasdarVezin;
}

/** The API's rows as the page reads them; one whose keys the engine does not know is left out. */
export function sarfRootFacts(
  rows: readonly {
    id: string;
    kok: string;
    bab: string;
    mastar: string | null;
    masdarVezin: string;
  }[]
): SarfRootFact[] {
  return rows.flatMap((row) => {
    const vezin = MASDAR_VEZINS.find((v) => v === row.masdarVezin);
    return isBabKey(row.bab) && vezin
      ? [
          {
            id: row.id,
            kok: row.kok,
            bab: row.bab,
            mastar: row.mastar,
            masdarVezin: vezin,
          },
        ]
      : [];
  });
}

const fits = (face: string): boolean => {
  const length = face.trim().length;
  return length >= FACE_MIN && length <= FACE_MAX;
};

/**
 * The cards of the tables on show, ready for `POST …/cards`. Null when a face
 * would be refused (3 to 5000 characters, as on "Kart ekle"): with no mastar
 * the backs are empty, and the page asks for one instead of sending.
 */
export function cekimCards(
  sarf: Sarf,
  tables: readonly CekimTablosu[],
  type: CardType
): CardBody[] | null {
  const cards = tables.flatMap((table) =>
    cekimDrafts(sarf, table).map((draft) => ({
      type,
      contentFront: draft.contentFront,
      contentBack: draft.contentBack,
      ...(draft.contentMeta ? { contentMeta: draft.contentMeta } : {}),
    }))
  );
  return cards.every(
    (card) => fits(card.contentFront) && fits(card.contentBack)
  )
    ? cards
    : null;
}

/**
 * The twenty-four as cards: the sîga on the front, its name and its meaning on
 * the back. They carry no `contentMeta`: a line of the Muhtelife is not a place
 * in a çekim table.
 */
export function muhtelifeCards(
  satirlar: readonly MuhtelifeSatir[],
  kipName: (id: MuhtelifeSatir["id"]) => string,
  type: CardType
): CardBody[] | null {
  const cards = satirlar.map((satir) => ({
    type,
    contentFront: satir.onEk ? `${satir.onEk} ${satir.arabic}` : satir.arabic,
    contentBack: satir.anlam ? `${kipName(satir.id)}: ${satir.anlam}` : "",
  }));
  return cards.every(
    (card) => fits(card.contentFront) && fits(card.contentBack)
  )
    ? cards
    : null;
}
