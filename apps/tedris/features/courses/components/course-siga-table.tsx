"use client";

import {
  BAB_NAMES,
  SIGA_COLUMNS,
  type SigaTable,
  sigaCellApplies,
} from "@medaris/sarf";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

// Every row is a grid, so the cards of one row stretch to one height; a table
// whose rows change their display loses its implied roles in some engines, so
// they are written out, as the system's Table does for `responsive="stack"` (a
// computed attribute, so the redundant-role lint, which is right for a table
// that keeps its display, does not fire).
const role = (name: string) => name;

/** The person column, then the three numbers; below 768 px the person goes above. */
const ROW =
  "grid grid-cols-[8rem_repeat(3,minmax(0,1fr))] gap-2 max-md:grid-cols-3";

/**
 * One sîga table: the persons down the side (gâib, gâibe, muhâtab, muhâtaba,
 * mütekellim; for an isim, müzekker and müennes), the numbers across (müfred,
 * tesniye, cem), a card in each cell. The rows are the kip's own (`table.rows`):
 * an emr-i hâzır has only the muhâtab's. The mütekellim has no dual: its row
 * fills the singular (vahde) and the plural (maa'l-gayr) only.
 *
 * The sîga's names come from `common.sarf`, the one catalogue nazar-web's
 * generator names them from too.
 *
 * Below 768 px the table does not scroll sideways: each row becomes a group,
 * its person above and its three cells under it, under one header line of the
 * numbers. The rows are grids at every width, so one row's cards are as tall
 * as its tallest.
 */
export const CourseSigaTable = <T extends { id: string }>({
  table,
  renderCard,
  onlyFilledRows = false,
  emptyLabel,
}: {
  table: SigaTable<T>;
  renderCard: (card: T) => ReactNode;
  /** Leave out the rows with no card ("Kendini sına", a round of missed cards). */
  onlyFilledRows?: boolean;
  /** What an empty cell reads out; "Bu sîganın kartı yok" by default. */
  emptyLabel?: string;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const sarf = useTranslations("common.sarf");
  const captionId = useId();
  const bab = BAB_NAMES[table.bab];
  const rows = table.rows.filter(
    (row) =>
      !onlyFilledRows ||
      SIGA_COLUMNS.some((column) => table.cells[row]?.[column] != null)
  );

  return (
    <table
      role={role("table")}
      // The caption's implied naming can go with the table's display.
      aria-labelledby={captionId}
      className="flex inline-full max-inline-[48rem] flex-col gap-2"
    >
      <caption id={captionId} className="pbe-2 text-start">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="mds-h4">
            {sarf(`kip.${table.kip}`)}
            {table.bina === "mechul" ? ` · ${sarf("bina.mechul")}` : null}
          </span>
          <span className="mds-arabic" dir="rtl" lang="ar">
            {table.kok}
          </span>
          {bab ? (
            <span className="mds-caption">
              {sarf("bab")}{" "}
              <span className="mds-arabic" dir="rtl" lang="ar">
                {bab}
              </span>
            </span>
          ) : null}
        </span>
      </caption>
      <thead role={role("rowgroup")} className="block">
        <tr role={role("row")} className={ROW}>
          {/* The corner stays in the tree at every width, so a body row's
              cells line up with the column headers; below 768 px it only
              leaves the grid's flow. */}
          <td role={role("cell")} className="max-md:sr-only" />
          {SIGA_COLUMNS.map((column) => (
            <th
              key={column}
              role={role("columnheader")}
              scope="col"
              className="mds-caption text-center font-medium"
            >
              {sarf(`sayi.${column}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody
        role={role("rowgroup")}
        className="flex flex-col gap-2 max-md:gap-3"
      >
        {rows.map((row) => (
          <tr key={row} role={role("row")} className={ROW}>
            <th
              role={role("rowheader")}
              scope="row"
              className="self-center text-start max-md:col-span-3"
            >
              <span className="mds-body-sm block font-semibold">
                {sarf(`row.${row}`)}
              </span>
              {row === "mutekellim" ? (
                <span className="mds-caption block">
                  {sarf("speakerForms")}
                </span>
              ) : null}
            </th>
            {SIGA_COLUMNS.map((column) => {
              const card = table.cells[row]?.[column] ?? null;
              return (
                <td key={column} role={role("cell")} className="flex flex-col">
                  {!sigaCellApplies(row, column) ? (
                    <span className="mds-visually-hidden">
                      {sarf("cellNone")}
                    </span>
                  ) : card ? (
                    renderCard(card)
                  ) : (
                    <span className="mds-visually-hidden">
                      {emptyLabel ?? t("sigaCellEmpty")}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
