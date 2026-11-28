/**
 * Draft cards from the engine: the Arabic fully vowelled on the front, a
 * meaning template on the back for the müderris to correct, and the sîga in
 * `contentMeta` so the talebe's deck lays the cards out as a çekim table.
 */

import type { BabKey } from "./bab";
import type { SigaMeta } from "./meta";
import { type CekimTablosu, cekim, readSarf, type Sarf } from "./sarf";
import { SLOTS } from "./siga";
import { conjugateMeaning, type Person } from "./turkce";

export interface SigaDraft {
  contentFront: string;
  contentBack: string;
  /** Null for a form beside the table (a cem'-i mükesser): a free card. */
  contentMeta: SigaMeta | null;
}

/** A draft that sits in a çekim table: its sîga is always known. */
export type SigaCekimDraft = SigaDraft & { contentMeta: SigaMeta };

/** Every sîga of a çekim table as a draft card, the book's order. */
export function cekimDrafts(sarf: Sarf, table: CekimTablosu): SigaDraft[] {
  const drafts: SigaDraft[] = [];
  for (const hucre of table.hucreler) {
    if (!hucre) continue;
    drafts.push({
      contentFront: hucre.arabic,
      contentBack: hucre.anlam,
      contentMeta: {
        kok: sarf.kok,
        bab: sarf.bab,
        kip: table.kip,
        bina: table.bina,
        sahis: hucre.sahis,
        cinsiyet: hucre.cinsiyet,
        sayi: hucre.sayi,
      },
    });
  }
  for (const ek of table.ekler) {
    drafts.push({
      contentFront: ek.arabic,
      contentBack: ek.anlam,
      contentMeta: null,
    });
  }
  return drafts;
}

// ---- the first generator (a deck's "Sîga üret" dialog) ----------------------------

/** Who acts, in Turkish, in SLOTS order: the back face starts with it. */
const WHO: readonly string[] = [
  "O (erkek)",
  "O ikisi (erkek)",
  "Onlar (erkekler)",
  "O (kadın)",
  "O ikisi (kadın)",
  "Onlar (kadınlar)",
  "Sen (erkek)",
  "Siz ikiniz (erkek)",
  "Siz (erkekler)",
  "Sen (kadın)",
  "Siz ikiniz (kadın)",
  "Siz (kadınlar)",
  "Ben",
  "Biz",
];

const PERSON: readonly Person[] = [
  "3sg",
  "3sg",
  "3pl",
  "3sg",
  "3sg",
  "3pl",
  "2sg",
  "2pl",
  "2pl",
  "2sg",
  "2pl",
  "2pl",
  "1sg",
  "1pl",
];

export interface SigaRequest {
  root: string;
  bab: BabKey;
  kips: readonly ("mazi" | "muzari")[];
  /** The mâzî meaning as "O … " says it: `yardım etti`. */
  maziMeaning: string;
  /** The muzâri meaning as "O … " says it: `yardım ediyor`. */
  muzariMeaning: string;
}

/**
 * The fourteen mâzî and fourteen muzâri sîgas of the ma'lûm as draft cards,
 * the mâzî first, each meaning as the müderris typed it and turned to its
 * person. Null when the root cannot be conjugated (`readRoot` says why).
 */
export function generateSigas(request: SigaRequest): SigaCekimDraft[] | null {
  const sarf = readSarf({ root: request.root, bab: request.bab });
  if (!sarf) return null;
  const drafts: SigaCekimDraft[] = [];
  for (const kip of ["mazi", "muzari"] as const) {
    if (!request.kips.includes(kip)) continue;
    const table = cekim(sarf, kip);
    if (!table) continue;
    const meaning =
      kip === "mazi" ? request.maziMeaning : request.muzariMeaning;
    table.hucreler.forEach((hucre, i) => {
      const slot = SLOTS[i];
      const person = PERSON[i];
      if (!hucre || !slot || !person) return;
      const verb = conjugateMeaning(meaning, person);
      drafts.push({
        contentFront: hucre.arabic,
        contentBack: verb ? `${WHO[i]} ${verb}` : "",
        contentMeta: {
          kok: sarf.kok,
          bab: sarf.bab,
          kip,
          bina: "malum",
          ...slot,
        },
      });
    });
  }
  return drafts;
}
