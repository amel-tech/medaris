"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { type AppealRow, STATUS_VARIANT } from "../appeals";
import { AppealDialog } from "./appeal-dialog";

/**
 * The table of İtirazlar: Ders · Köşk · Ret gerekçesi · İtiraz durumu ·
 * Karar notu, and "İtiraz aç" on a refused request that has no appeal yet.
 * A sent appeal reads the list again from the server.
 */
export function AppealsTable({
  madrasahId,
  rows,
}: {
  madrasahId: string;
  rows: AppealRow[];
}) {
  const t = useTranslations("nazar.Appeals");
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const [opening, setOpening] = useState<AppealRow | null>(null);

  const columns: TableColumn<AppealRow>[] = [
    {
      key: "course",
      header: t("columns.course"),
      rowHeader: true,
      width: "20%",
      render: (row) => <bdi className="font-semibold">{row.title}</bdi>,
    },
    {
      key: "kosk",
      header: t("columns.kosk"),
      width: "15%",
      render: (row) => <bdi>{row.kosk}</bdi>,
    },
    {
      key: "rejectReason",
      header: t("columns.rejectReason"),
      width: "25%",
      render: (row) => <bdi>{row.rejectReason}</bdi>,
    },
    {
      key: "status",
      header: t("columns.status"),
      width: "12%",
      render: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]}>
          {t(`status.${row.status}`)}
        </Badge>
      ),
    },
    {
      key: "note",
      header: t("columns.note"),
      width: "18%",
      render: (row) => <bdi>{row.note}</bdi>,
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "10%",
      render: (row) =>
        row.canAppeal ? (
          <Button
            variant="outline"
            size="small"
            aria-label={t("openLabel", { title: row.title })}
            onClick={() => setOpening(row)}
          >
            {t("open")}
          </Button>
        ) : null,
    },
  ];

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="appeals"
      aria-busy={loading || undefined}
    >
      <Table
        caption={t("caption")}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        responsive="stack"
      />
      {opening ? (
        <AppealDialog
          key={opening.id}
          madrasahId={madrasahId}
          row={opening}
          onClose={() => setOpening(null)}
          onDone={() => startTransition(() => router.refresh())}
        />
      ) : null}
    </div>
  );
}
