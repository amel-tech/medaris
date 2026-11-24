"use client";

import {
  BABS,
  type BabKey,
  type Bina,
  type CekimTablosu,
  cekim,
  hasMechul,
  isBabKey,
  MASDAR_VEZINS,
  type MasdarVezin,
  type MuhtelifeId,
  muhtelife,
  muhtelifeKips,
  readSarf,
} from "@medaris/sarf";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import { listCourseSarfRoots } from "../actions/sarf";
import { CekimHand, CekimTable, MuhtelifeGrid } from "./sarf-tables";

interface Root {
  id: string;
  kok: string;
  bab: BabKey;
  mastar: string | null;
  masdarVezin: MasdarVezin;
}

type Load =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; roots: Root[] };

/**
 * The "Sarf" tab of the course page: the roots the müderris put on the course,
 * each with the Emsile's twenty-four sîgas and, on a sîga, its çekim as a
 * table or on the hand. Read only: the same tables the müderris sees in
 * nazar-web, written here by the same engine from the same root.
 */
export function CourseSarfTab({ courseId }: { courseId: string }) {
  const t = useTranslations("tedris.CoursePage");
  const sarfWords = useTranslations("common.sarf");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [rootId, setRootId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MuhtelifeId | null>(null);
  const [bina, setBina] = useState<Bina>("malum");
  const [view, setView] = useState<"tablo" | "el">("tablo");

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const result = await listCourseSarfRoots(courseId);
      if (sendToSignIn(result)) return;
      if (!result.success) {
        setLoad({ state: "failed" });
        return;
      }
      // A row whose keys this build's engine does not know is left out.
      const roots = result.data.flatMap((row) => {
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
      setLoad({ state: "ready", roots });
      setRootId((was) => was ?? roots[0]?.id ?? null);
    } catch {
      setLoad({ state: "failed" });
    }
  }, [courseId]);

  useEffect(() => {
    void read();
  }, [read]);

  const roots = load.state === "ready" ? load.roots : [];
  const root = roots.find((candidate) => candidate.id === rootId) ?? null;
  const sarf = useMemo(
    () =>
      root
        ? readSarf({
            root: root.kok,
            bab: root.bab,
            mastar: root.mastar ?? undefined,
            masdar: root.masdarVezin,
          })
        : null,
    [root]
  );
  const satirlar = useMemo(() => (sarf ? muhtelife(sarf) : []), [sarf]);

  if (load.state === "loading") {
    return <output className="mds-caption">{t("sarfLoading")}</output>;
  }
  if (load.state === "failed") {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="mds-body-sm">{t("sarfFailed")}</p>
        <div>
          <Button variant="outline" size="small" onClick={() => void read()}>
            {t("sarfRetry")}
          </Button>
        </div>
      </div>
    );
  }
  if (roots.length === 0 || !sarf) {
    return <EmptyState>{t("sarfEmpty")}</EmptyState>;
  }

  const kips = selected ? muhtelifeKips(selected) : [];
  const mechul = kips.some(hasMechul);
  const tables: CekimTablosu[] = kips.flatMap((kip) => {
    const table = cekim(sarf, kip, mechul ? bina : "malum");
    return table ? [table] : [];
  });
  const handable = tables.every((table) => table.tur === "fiil");

  return (
    <div className="flex flex-col gap-section">
      <ChoiceChips
        legend={t("sarfRoots")}
        legendVisible
        value={rootId}
        // A single-choice group can be emptied; one root is always on.
        onChange={(value) => {
          if (!value) return;
          setRootId(value);
          setSelected(null);
        }}
        options={roots.map((candidate) => ({
          value: candidate.id,
          label: (
            <>
              <span className="mds-arabic" lang="ar" dir="rtl">
                {candidate.kok}
              </span>{" "}
              <span className="mds-caption">{BABS[candidate.bab].latin}</span>
            </>
          ),
        }))}
      />

      <section className="flex flex-col gap-3">
        <h3 className="mds-h3">{t("sarfMuhtelife")}</h3>
        <p className="mds-body-sm text-neutral-muted">{t("sarfHint")}</p>
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
          <h3 className="mds-h3">{t("sarfCekim")}</h3>
          <div className="flex flex-wrap gap-6">
            {mechul ? (
              <ChoiceChips
                legend={t("sarfBina")}
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
                legend={t("sarfView")}
                legendVisible
                value={view}
                onChange={(value) => setView(value === "el" ? "el" : "tablo")}
                options={[
                  { value: "tablo", label: t("sarfViewTable") },
                  { value: "el", label: t("sarfViewHand") },
                ]}
              />
            ) : null}
          </div>
          {tables.map((table) =>
            handable && view === "el" ? (
              <CekimHand key={`${table.kip}-${table.bina}`} table={table} />
            ) : (
              <CekimTable key={`${table.kip}-${table.bina}`} table={table} />
            )
          )}
        </section>
      ) : null}
    </div>
  );
}
