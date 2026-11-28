"use client";

import {
  type CekimTablosu,
  type Hucre,
  type MuhtelifeId,
  type MuhtelifeSatir,
  SIGA_COLUMNS,
  type SigaRow,
  sigaRows,
} from "@medaris/sarf";
import { Badge } from "@medaris/ui/mds/badge";
import { useTranslations } from "next-intl";
import { useId } from "react";

/**
 * The sarf tables, drawn from what `@medaris/sarf` wrote: the twenty-four
 * sîgas of the Emsile-i Muhtelife as a grid, and one kip's çekim either as a
 * sarf book's table or on the hand the müderris teaches it with.
 *
 * Every sîga name comes from `common.sarf`. The Arabic is set RTL on its own
 * element, never on an ancestor (MDS-TYP).
 */

const Arabic = ({ text, large = false }: { text: string; large?: boolean }) => (
  <span
    lang="ar"
    dir="rtl"
    className={
      large
        ? "mds-arabic text-[length:var(--fs-arabic)]"
        : "mds-arabic text-[length:var(--fs-arabic-min)]"
    }
  >
    {text}
  </span>
);

/** The twenty-four, each a button that opens its çekim. */
export function MuhtelifeGrid({
  satirlar,
  selected,
  onSelect,
}: {
  satirlar: readonly MuhtelifeSatir[];
  selected: MuhtelifeId | null;
  onSelect: (id: MuhtelifeId) => void;
}) {
  const sarf = useTranslations("common.sarf");
  return (
    <ol className="m-0 grid list-none gap-2 p-0 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]">
      {satirlar.map((satir) => {
        const on = satir.id === selected;
        return (
          <li key={satir.id} className="flex">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(satir.id)}
              className={
                on
                  ? "flex inline-full flex-col items-start gap-1 rounded-control border-2 border-brand-default bg-brand-subtle p-3 text-start"
                  : "flex inline-full flex-col items-start gap-1 rounded-control border border-neutral-subtle p-3 text-start hover:bg-neutral-hover"
              }
            >
              <span className="mds-caption flex inline-full items-center justify-between gap-2 text-neutral-muted">
                <span>
                  {satir.sira}. {sarf(`kip.${satir.id}`)}
                </span>
                {satir.taslak ? (
                  <Badge variant="warning" title={sarf("taslakHelp")}>
                    {sarf("taslak")}
                  </Badge>
                ) : null}
              </span>
              <span className="self-end">
                <Arabic text={satir.arabic} large />
              </span>
              {satir.anlam ? (
                <span className="mds-body-sm">{satir.anlam}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** A table's sîgas by the row and the column they sit in. */
const cellsOf = (
  table: CekimTablosu
): Partial<Record<SigaRow, Partial<Record<string, Hucre>>>> => {
  const cells: Partial<Record<SigaRow, Partial<Record<string, Hucre>>>> = {};
  for (const hucre of table.hucreler) {
    if (!hucre) continue;
    const row: SigaRow =
      hucre.sahis === null
        ? (hucre.cinsiyet ?? "muzekker")
        : hucre.sahis === "mutekellim"
          ? "mutekellim"
          : hucre.sahis === "gaib"
            ? hucre.cinsiyet === "muennes"
              ? "gaibe"
              : "gaib"
            : hucre.cinsiyet === "muennes"
              ? "muhataba"
              : "muhatab";
    const cell = cells[row] ?? {};
    cell[hucre.sayi] = hucre;
    cells[row] = cell;
  }
  return cells;
};

const Sigasi = ({ hucre }: { hucre: Hucre }) => (
  <span className="flex flex-col items-center gap-1 text-center">
    <Arabic text={hucre.arabic} />
    {hucre.anlam ? (
      <span className="mds-caption text-neutral-muted">{hucre.anlam}</span>
    ) : null}
  </span>
);

/** The kip's name with its binâ, as a table's caption says it. */
export function useCekimTitle() {
  const sarf = useTranslations("common.sarf");
  return (table: CekimTablosu) =>
    table.tur === "fiil" &&
    table.kip !== "taaccub_evvel" &&
    table.kip !== "taaccub_sani"
      ? `${sarf(`kip.${table.kip}`)} · ${sarf(`bina.${table.bina}`)}`
      : sarf(`kip.${table.kip}`);
}

/** A sarf book's table: the persons down the side, the numbers across. */
export function CekimTable({ table }: { table: CekimTablosu }) {
  const sarf = useTranslations("common.sarf");
  const title = useCekimTitle();
  const cells = cellsOf(table);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="inline-full min-inline-[32rem] border-collapse">
          <caption className="mds-h4 pbe-2 text-start">{title(table)}</caption>
          <thead>
            <tr>
              <td />
              {SIGA_COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="mds-caption p-2 text-center font-medium"
                >
                  {sarf(`sayi.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sigaRows(table.kip).map((row) => (
              <tr key={row} className="border-bs border-neutral-subtle">
                <th scope="row" className="mds-body-sm p-2 text-start">
                  {sarf(`row.${row}`)}
                  {row === "mutekellim" ? (
                    <span className="mds-caption block font-normal">
                      {sarf("speakerForms")}
                    </span>
                  ) : null}
                </th>
                {SIGA_COLUMNS.map((column) => {
                  const hucre = cells[row]?.[column];
                  return (
                    <td key={column} className="p-2 align-top">
                      {hucre ? (
                        <Sigasi hucre={hucre} />
                      ) : (
                        <span className="mds-visually-hidden">
                          {sarf("cellNone")}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.ekler.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="mds-label">{sarf("extraPlurals")}</p>
          <ul className="m-0 flex list-none flex-wrap gap-4 p-0">
            {table.ekler.map((ek) => (
              <li key={ek.arabic} className="flex flex-col items-center gap-1">
                <Arabic text={ek.arabic} />
                <span className="mds-caption text-neutral-muted">
                  {sarf(`row.${ek.cinsiyet}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The four fingers, from the one the sarf starts on, and the lift each has. */
const FINGERS: readonly { row: SigaRow; lift: string }[] = [
  { row: "gaib", lift: "mbs-6" },
  { row: "gaibe", lift: "mbs-0" },
  { row: "muhatab", lift: "mbs-3" },
  { row: "muhataba", lift: "mbs-10" },
];

/**
 * The hand a fiil's fourteen sîgas are counted on: a finger for each of the
 * gâib, the gâibe, the muhâtab and the muhâtaba, its three joints the müfred,
 * the tesniye and the cem', and the thumb for the mütekellim's two. A kip that
 * has no sîga for a finger (an emir said only to the present) leaves it bare.
 *
 * The same sîgas as the table, so a screen reader is given the table's own
 * naming: each joint reads its person and its number before its sîga.
 */
export function CekimHand({ table }: { table: CekimTablosu }) {
  const sarf = useTranslations("common.sarf");
  const title = useCekimTitle();
  const headingId = useId();
  const cells = cellsOf(table);
  const joint = (row: SigaRow, column: (typeof SIGA_COLUMNS)[number]) => {
    const hucre = cells[row]?.[column];
    return (
      <li
        key={column}
        className="flex min-block-[4.5rem] flex-col items-center justify-center gap-1 border-bs border-neutral-subtle p-2 first:border-bs-0"
      >
        <span className="mds-caption text-neutral-muted">
          <span className="mds-visually-hidden">{sarf(`row.${row}`)} </span>
          {row === "mutekellim"
            ? sarf("speakerForms").split(" · ")[column === "mufred" ? 0 : 1]
            : sarf(`sayi.${column}`)}
        </span>
        {hucre ? (
          <Sigasi hucre={hucre} />
        ) : (
          <span aria-hidden="true" className="text-neutral-muted">
            —
          </span>
        )}
      </li>
    );
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="mds-h4">
        {title(table)}
      </h3>
      <div className="overflow-x-auto">
        <div className="flex min-inline-[44rem] flex-col">
          <div className="grid grid-cols-5 items-end gap-2">
            {FINGERS.map(({ row, lift }) => (
              <div key={row} className={`flex flex-col gap-1 ${lift}`}>
                <p className="mds-label text-center">{sarf(`row.${row}`)}</p>
                <ol className="m-0 flex list-none flex-col rounded-t-[2.5rem] border border-be-0 border-neutral-subtle bg-neutral-sunken p-0 pbs-3">
                  {SIGA_COLUMNS.map((column) => joint(row, column))}
                </ol>
              </div>
            ))}
            <div className="flex flex-col gap-1 mbs-20">
              <p className="mds-label text-center">{sarf("row.mutekellim")}</p>
              <ol className="m-0 flex list-none flex-col rounded-t-[2.5rem] border border-be-0 border-neutral-subtle bg-neutral-sunken p-0 pbs-3">
                {(["mufred", "cem"] as const).map((column) =>
                  joint("mutekellim", column)
                )}
              </ol>
            </div>
          </div>
          {/* The palm the five stand on. */}
          <div
            aria-hidden="true"
            className="block-10 rounded-b-[2.5rem] border border-neutral-subtle bg-neutral-sunken"
          />
        </div>
      </div>
    </section>
  );
}
