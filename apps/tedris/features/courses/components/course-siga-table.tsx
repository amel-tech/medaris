"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  BAB_NAMES,
  SIGA_COLUMNS,
  SIGA_ROWS,
  type SigaKip,
  type SigaRow,
  type SigaSayi,
  type SigaTable,
  sigaCellApplies,
} from "../siga-table";

// Every row is a grid, so the cards of one row stretch to one height; a table
// whose rows change their display loses its implied roles in some engines, so
// they are written out, as the system's Table does for `responsive="stack"` (a
// computed attribute, so the redundant-role lint, which is right for a table
// that keeps its display, does not fire).
const role = (name: string) => name;

/** The person column, then the three numbers; below 768 px the person goes above. */
const ROW =
  "grid grid-cols-[8rem_repeat(3,minmax(0,1fr))] gap-2 max-md:grid-cols-3";

// The course page's catalogue is flat (one string per key), so each sîga key
// maps to its own message.
const KIP_KEY = {
  mazi: "sigaKipMazi",
  muzari: "sigaKipMuzari",
} as const satisfies Record<SigaKip, string>;
const SAYI_KEY = {
  mufred: "sigaSayiMufred",
  tesniye: "sigaSayiTesniye",
  cem: "sigaSayiCem",
} as const satisfies Record<SigaSayi, string>;
const ROW_KEY = {
  gaib: "sigaRowGaib",
  gaibe: "sigaRowGaibe",
  muhatab: "sigaRowMuhatab",
  muhataba: "sigaRowMuhataba",
  mutekellim: "sigaRowMutekellim",
} as const satisfies Record<SigaRow, string>;

/**
 * One sîga table: the persons down the side (gâib, gâibe, muhâtab, muhâtaba,
 * mütekellim), the numbers across (müfred, tesniye, cem), a card in each cell.
 * The mütekellim has no dual: its row fills the singular (vahde) and the
 * plural (maa'l-gayr) only.
 *
 * Below 768 px the table does not scroll sideways: each row becomes a group,
 * its person above and its three cells under it, under one header line of the
 * numbers. The rows are grids at every width, so one row's cards are as tall
 * as its tallest.
 */
export const CourseSigaTable = <T extends { id: string }>({
  table,
  renderCard,
}: {
  table: SigaTable<T>;
  /** The cell's content; null leaves the cell empty (not in this round). */
  renderCard: (card: T) => ReactNode;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const bab = BAB_NAMES[table.bab];

  return (
    <table
      role={role("table")}
      className="flex inline-full max-inline-[48rem] flex-col gap-2"
    >
      <caption className="pbe-2 text-start">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="mds-h4">{t(KIP_KEY[table.kip])}</span>
          <span
            className="font-arabic text-[1.25rem] leading-[1.9]"
            dir="rtl"
            lang="ar"
          >
            {table.kok}
          </span>
          {bab ? (
            <span className="mds-caption">
              {t("sigaBab")}{" "}
              <span className="font-arabic" dir="rtl" lang="ar">
                {bab}
              </span>
            </span>
          ) : null}
        </span>
      </caption>
      <thead role={role("rowgroup")} className="block">
        <tr role={role("row")} className={ROW}>
          <td className="max-md:hidden" />
          {SIGA_COLUMNS.map((column) => (
            <th
              key={column}
              role={role("columnheader")}
              scope="col"
              className="mds-eyebrow text-center"
            >
              {t(SAYI_KEY[column])}
            </th>
          ))}
        </tr>
      </thead>
      <tbody
        role={role("rowgroup")}
        className="flex flex-col gap-2 max-md:gap-3"
      >
        {SIGA_ROWS.map((row) => (
          <tr key={row} role={role("row")} className={ROW}>
            <th
              role={role("rowheader")}
              scope="row"
              className="self-center text-start max-md:col-span-3"
            >
              <span className="mds-body-sm block font-semibold">
                {t(ROW_KEY[row])}
              </span>
              {row === "mutekellim" ? (
                <span className="mds-caption block">
                  {t("sigaSpeakerForms")}
                </span>
              ) : null}
            </th>
            {SIGA_COLUMNS.map((column) => {
              const card = table.cells[row][column];
              return (
                <td key={column} role={role("cell")} className="flex flex-col">
                  {!sigaCellApplies(row, column) ? (
                    <span className="mds-visually-hidden">
                      {t("sigaCellNone")}
                    </span>
                  ) : card ? (
                    renderCard(card)
                  ) : (
                    <span className="mds-visually-hidden">
                      {t("sigaCellEmpty")}
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
