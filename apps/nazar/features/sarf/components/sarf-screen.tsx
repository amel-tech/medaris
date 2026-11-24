"use client";

import {
  BAB_KEYS,
  BABS,
  type BabKey,
  type Bina,
  type CekimTablosu,
  cekim,
  hasMechul,
  MASDAR_VEZIN_NAMES,
  MASDAR_VEZINS,
  type MasdarVezin,
  type MuhtelifeId,
  muhtelife,
  muhtelifeKips,
  readRoot,
  readSarf,
} from "@medaris/sarf";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { createCards } from "../../decks/actions";
import type { CardType } from "../../decks/decks";
import { deleteSarfRoot, saveSarfRoot } from "../actions";
import { cekimCards, muhtelifeCards, type SarfRootFact } from "../sarf";
import { CekimHand, CekimTable, MuhtelifeGrid } from "./sarf-tables";

export interface SarfDeckOption {
  id: string;
  title: string;
  cardType: CardType;
}

type View = "tablo" | "el";

/**
 * "Kök ver": the müderris types a root and picks its bâb, and the Emsile's
 * twenty-four sîgas come out of the engine; a sîga opens its çekim, as a sarf
 * book's table or on the hand. What is on show goes to the course ("Derse
 * ekle", so the talebe sees the same tables) or into a deck as cards.
 *
 * Nothing is fetched to draw a table: the engine runs here, on every keystroke.
 */
export function SarfScreen({
  courseId,
  roots,
  decks,
  extra,
}: {
  courseId: string;
  roots: SarfRootFact[];
  /** Empty when the caller may not manage the course's decks. */
  decks: SarfDeckOption[];
  /** More to do with the tables on show (the lesson board's "Tahtaya ekle"). */
  extra?: (shown: { kok: string; tables: CekimTablosu[] }) => ReactNode;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const sarfWords = useTranslations("common.sarf");
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();

  const [root, setRoot] = useState("");
  const [bab, setBab] = useState<BabKey>("nasara");
  const [mastar, setMastar] = useState("");
  const [vezin, setVezin] = useState<MasdarVezin>(BABS.nasara.masdar);
  const [selected, setSelected] = useState<MuhtelifeId | null>(null);
  const [bina, setBina] = useState<Bina>("malum");
  const [view, setView] = useState<View>("tablo");
  const [deckId, setDeckId] = useState<string | null>(decks[0]?.id ?? null);
  const [failure, setFailure] = useState<string | null>(null);

  const rootRead = readRoot(root);
  const rootProblem = "problem" in rootRead ? rootRead.problem : null;
  const sarf = useMemo(
    () => readSarf({ root, bab, mastar, masdar: vezin }),
    [root, bab, mastar, vezin]
  );
  const satirlar = useMemo(() => (sarf ? muhtelife(sarf) : []), [sarf]);
  const kips = selected ? muhtelifeKips(selected) : [];
  const mechul = kips.some(hasMechul);
  const tables: CekimTablosu[] = sarf
    ? kips.flatMap((kip) => {
        const table = cekim(sarf, kip, mechul ? bina : "malum");
        return table ? [table] : [];
      })
    : [];
  const handable = tables.every((table) => table.tur === "fiil");
  const saved = sarf
    ? roots.find((r) => r.kok === sarf.kok && r.bab === sarf.bab)
    : undefined;
  const deck = decks.find((d) => d.id === deckId) ?? null;

  const changeBab = (next: BabKey) => {
    setBab(next);
    // The masdar is semâî; each bâb's own model is the first offer.
    setVezin(BABS[next].masdar);
  };

  const open = (fact: SarfRootFact) => {
    setRoot(fact.kok);
    setBab(fact.bab);
    setMastar(fact.mastar ?? "");
    setVezin(fact.masdarVezin);
    setSelected(null);
    setFailure(null);
  };

  const run = (work: () => Promise<string | null>) => {
    if (pending) return;
    setFailure(null);
    startTransition(async () => {
      const done = await work();
      if (done === null) return;
      notify({ tone: "success", title: done });
      router.refresh();
    });
  };

  const addToCourse = () => {
    if (!sarf) return;
    run(async () => {
      const outcome = await saveSarfRoot(courseId, {
        kok: sarf.kok,
        bab: sarf.bab,
        mastar: mastar.trim() === "" ? null : mastar.trim(),
        masdarVezin: sarf.masdar,
      });
      if (handleUnauthenticated(outcome)) return null;
      if (!outcome.success) {
        setFailure(words("Sarf.failed"));
        return null;
      }
      return words(saved ? "Sarf.updatedInCourse" : "Sarf.addedToCourse");
    });
  };

  const removeFromCourse = (fact: SarfRootFact) =>
    run(async () => {
      const outcome = await deleteSarfRoot(courseId, fact.id);
      if (handleUnauthenticated(outcome)) return null;
      if (!outcome.success) {
        setFailure(words("Sarf.failed"));
        return null;
      }
      return words("Sarf.removedFromCourse");
    });

  const addCards = (all: boolean) => {
    if (!sarf || !deck) return;
    const cards = all
      ? muhtelifeCards(satirlar, (id) => sarfWords(`kip.${id}`), deck.cardType)
      : cekimCards(sarf, tables, deck.cardType);
    if (!cards) {
      setFailure(words("Sarf.needsMastar"));
      return;
    }
    run(async () => {
      const outcome = await createCards(deck.id, cards);
      if (handleUnauthenticated(outcome)) return null;
      if (!outcome.success) {
        setFailure(words("Sarf.failed"));
        return null;
      }
      return words("Sarf.addedToDeck", { count: outcome.data.count });
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
          <Field
            label={words("Sarf.root")}
            help={words("Sarf.rootHelp")}
            error={
              root.trim() !== "" && rootProblem && rootProblem !== "required"
                ? words(
                    rootProblem === "weak"
                      ? "Sarf.rootWeak"
                      : rootProblem === "doubled"
                        ? "Sarf.rootDoubled"
                        : "Sarf.rootLetters"
                  )
                : undefined
            }
          >
            <Input
              lang="ar"
              dir="rtl"
              className="font-arabic text-[length:var(--fs-arabic-min)]"
              value={root}
              onChange={(event) => {
                setRoot(event.target.value);
                setSelected(null);
              }}
            />
          </Field>
          <Field label={words("Sarf.bab")}>
            <Select
              value={bab}
              onChange={(value) => {
                const next = BAB_KEYS.find((key) => key === value);
                if (next) changeBab(next);
              }}
              options={BAB_KEYS.map((key) => ({
                value: key,
                label: BABS[key].latin,
              }))}
            />
          </Field>
          <Field label={words("Sarf.mastar")} help={words("Sarf.mastarHelp")}>
            <Input
              value={mastar}
              onChange={(event) => setMastar(event.target.value)}
            />
          </Field>
          <Field
            label={words("Sarf.masdarVezin")}
            help={words("Sarf.masdarVezinHelp")}
          >
            <Select
              value={vezin}
              onChange={(value) => {
                const next = MASDAR_VEZINS.find((v) => v === value);
                if (next) setVezin(next);
              }}
              options={MASDAR_VEZINS.map((v) => ({
                value: v,
                label: MASDAR_VEZIN_NAMES[v],
              }))}
            />
          </Field>
        </div>
        <p className="mds-body-sm text-neutral-muted">{words("Sarf.scope")}</p>
        {failure ? <Alert tone="error">{failure}</Alert> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mds-h3">{words("Sarf.savedRoots")}</h2>
        {roots.length === 0 ? (
          <p className="mds-body-sm text-neutral-muted">
            {words("Sarf.savedEmpty")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
            {roots.map((fact) => (
              <li
                key={fact.id}
                className="flex items-center gap-2 rounded-control border border-neutral-subtle p-2"
              >
                <Button variant="ghost" size="small" onClick={() => open(fact)}>
                  <span className="mds-arabic" lang="ar" dir="rtl">
                    {fact.kok}
                  </span>
                  <span className="mds-caption">{BABS[fact.bab].latin}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  disabled={pending}
                  onClick={() => removeFromCourse(fact)}
                >
                  {words("Sarf.removeFromCourse")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sarf ? (
        <>
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="mds-h2">{words("Sarf.muhtelifeTitle")}</h2>
                <p className="mds-body-sm text-neutral-muted">
                  {words("Sarf.muhtelifeHint")}
                </p>
              </div>
              <Button
                variant={saved ? "secondary" : "primary"}
                loading={pending}
                onClick={addToCourse}
              >
                {words(saved ? "Sarf.updateInCourse" : "Sarf.addToCourse")}
              </Button>
            </div>
            <MuhtelifeGrid
              satirlar={satirlar}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                setBina("malum");
              }}
            />
          </section>

          {tables.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="mds-h2">{words("Sarf.cekimTitle")}</h2>
              <div className="flex flex-wrap gap-6">
                {mechul ? (
                  <ChoiceChips
                    legend={words("Sarf.bina")}
                    legendVisible
                    value={bina}
                    onChange={(value) =>
                      setBina(value === "mechul" ? "mechul" : "malum")
                    }
                    options={[
                      { value: "malum", label: sarfWords("bina.malum") },
                      { value: "mechul", label: sarfWords("bina.mechul") },
                    ]}
                  />
                ) : null}
                {handable ? (
                  <ChoiceChips
                    legend={words("Sarf.view")}
                    legendVisible
                    value={view}
                    onChange={(value) =>
                      setView(value === "el" ? "el" : "tablo")
                    }
                    options={[
                      { value: "tablo", label: words("Sarf.viewTable") },
                      { value: "el", label: words("Sarf.viewHand") },
                    ]}
                  />
                ) : null}
              </div>
              {tables.map((table) =>
                handable && view === "el" ? (
                  <CekimHand key={`${table.kip}-${table.bina}`} table={table} />
                ) : (
                  <CekimTable
                    key={`${table.kip}-${table.bina}`}
                    table={table}
                  />
                )
              )}
              {extra ? extra({ kok: sarf.kok, tables }) : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="mds-h3">{words("Sarf.deckTitle")}</h2>
            {decks.length === 0 ? (
              <p className="mds-body-sm text-neutral-muted">
                {words("Sarf.noDecks")}
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <Field label={words("Sarf.deck")}>
                  <Select
                    value={deckId}
                    onChange={setDeckId}
                    options={decks.map((d) => ({
                      value: d.id,
                      label: d.title,
                    }))}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={pending || !deck || tables.length === 0}
                  onClick={() => addCards(false)}
                >
                  {words("Sarf.addToDeck")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || !deck}
                  onClick={() => addCards(true)}
                >
                  {words("Sarf.addAllToDeck")}
                </Button>
              </div>
            )}
          </section>
        </>
      ) : (
        <EmptyState>{words("Sarf.emptyPrompt")}</EmptyState>
      )}
    </div>
  );
}
