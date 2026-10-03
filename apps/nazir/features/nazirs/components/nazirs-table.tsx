"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { NazirRow } from "../nazirs";
import { DismissDialog } from "./dismiss-dialog";
import { PermissionEditor } from "./permission-editor";

/**
 * The table of "Medrese nazırları" (nazir 05). The rows arrive worded and
 * dated, so the table has nothing to translate; the kit's `Table` keeps state
 * of its own and the dismissal and permission dialogs are opened from here,
 * which is why this is a client component.
 */
export function NazirsTable({
  rows,
  madrasahId,
  madrasahName,
  locale,
  timeZone,
}: {
  rows: NazirRow[];
  madrasahId: string;
  madrasahName: string;
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations("nazir");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dismissing, setDismissing] = useState<NazirRow | null>(null);
  const [editing, setEditing] = useState<NazirRow | null>(null);

  const columns: TableColumn<NazirRow>[] = [
    {
      key: "nazir",
      header: t("Nazirs.columns.nazir"),
      rowHeader: true,
      width: "24%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <Avatar name={row.name} decorative />
          <span className="flex min-inline-0 flex-col">
            <bdi className="font-semibold">{row.name}</bdi>
            {row.email ? (
              <bdi dir="ltr" className="mds-caption break-all font-mono">
                {row.email}
              </bdi>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "grants",
      header: t("Nazirs.columns.grants"),
      width: "28%",
      render: (row) =>
        row.awaiting ? (
          <span className="flex flex-col items-start gap-1">
            <Badge variant="outline">{t("Nazirs.noGrants")}</Badge>
            <span className="mds-caption">
              <bdi>{row.appointedLine}</bdi>
            </span>
          </span>
        ) : (
          <span className="flex flex-col items-start gap-2">
            {row.groups.length > 0 ? (
              <span className="flex flex-wrap gap-2">
                {row.groups.map((name) => (
                  <Badge key={name} variant="secondary">
                    <bdi>{name}</bdi>
                  </Badge>
                ))}
              </span>
            ) : null}
            {row.extra ? (
              <span className="mds-caption" data-testid="extra-permissions">
                {row.extra}
              </span>
            ) : null}
            {row.courseScope ? (
              <span className="mds-caption" data-testid="course-scope">
                <bdi>{row.courseScope}</bdi>
              </span>
            ) : null}
          </span>
        ),
    },
    {
      key: "end",
      header: t("Nazirs.columns.end"),
      width: "11%",
      render: (row) =>
        row.end ? (
          row.end.iso ? (
            <time dateTime={row.end.iso}>{row.end.label}</time>
          ) : (
            row.end.label
          )
        ) : (
          t("Nazirs.noValue")
        ),
    },
    {
      key: "giver",
      header: t("Nazirs.columns.giver"),
      width: "14%",
      render: (row) =>
        row.giver ? (
          <span className="flex flex-col">
            <bdi>{row.giver.name}</bdi>
            <time className="mds-caption" dateTime={row.giver.at.iso}>
              {row.giver.at.label}
            </time>
          </span>
        ) : (
          t("Nazirs.noValue")
        ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Nazirs.columns.actions")}
        </span>
      ),
      align: "right",
      width: "23%",
      render: (row) => (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="small"
            aria-label={t(
              row.awaiting
                ? "Nazirs.givePermissionLabel"
                : "Nazirs.editPermissionsLabel",
              { name: row.name }
            )}
            onClick={() => setEditing(row)}
          >
            {t(
              row.awaiting ? "Nazirs.givePermission" : "Nazirs.editPermissions"
            )}
          </Button>
          <Button
            variant="ghost"
            size="small"
            aria-label={t("Nazirs.dismissLabel", { name: row.name })}
            onClick={() => setDismissing(row)}
          >
            {t("Nazirs.dismiss")}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div data-testid="nazirs">
      <Table
        caption={t("Nazirs.caption", { name: madrasahName })}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={t("Nazirs.empty")}
        responsive="stack"
      />
      <PermissionEditor
        madrasahId={madrasahId}
        madrasahName={madrasahName}
        nazir={editing}
        timeZone={timeZone}
        onClose={() => setEditing(null)}
        onDone={() => startTransition(() => router.refresh())}
      />
      <DismissDialog
        madrasahId={madrasahId}
        madrasahName={madrasahName}
        nazir={dismissing}
        locale={locale}
        timeZone={timeZone}
        onClose={() => setDismissing(null)}
        onDone={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
