"use client";

import type {
  MedarisNazimResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  codeKey,
  dismissOpen,
  endLabel,
  formatDay,
  heldGroupsOf,
  type Messages,
  orderByCatalog,
} from "../present";
import { DismissDialog } from "./dismiss-dialog";
import { PermissionsDialog } from "./permissions-dialog";

interface Props {
  /** null when the first read failed */
  nazims: MedarisNazimResponse[] | null;
  catalog: PermissionCatalogResponse | null;
  groups: PermissionGroupResponse[] | null;
}

/**
 * Medaris nazımları (nizam 11): who holds the Medaris nazımı role right now,
 * with their groups, single permissions, end, who gave it and when. "Medaris
 * nazımı ata" and "İzinleri düzenle" open nizam/12; "Görevden al" opens the
 * dismissal question. The last stays shut until the version gate of 4 Ekim 2026
 * (decided on the viewer's clock, so the page itself needs no reload when the
 * day comes); the screen never says why.
 */
export function NazimsView({ nazims, catalog, groups }: Props) {
  const tm = useTranslations("nizam.NazimsPage");
  const t = tm as unknown as Messages;
  const tc = useTranslations("nizam.PermissionCatalog");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [appointing, setAppointing] = useState(false);
  const [editing, setEditing] = useState<MedarisNazimResponse | null>(null);
  const [dismissing, setDismissing] = useState<MedarisNazimResponse | null>(
    null
  );
  // Read on the client after mounting, so server and browser agree while hydrating.
  const [gateOpen, setGateOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const at = Date.now();
    setNow(new Date(at));
    setGateOpen(dismissOpen(at));
  }, []);

  const refresh = () => startTransition(() => router.refresh());
  const ready = catalog !== null && groups !== null;

  const short = (code: string) =>
    tc(`permissions.${codeKey(code)}.short` as never);

  const columns: TableColumn<MedarisNazimResponse>[] = [
    {
      key: "person",
      header: t("columns.person"),
      rowHeader: true,
      width: "22%",
      render: (n) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={n.user.name ?? n.user.email ?? ""} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">
              {n.user.name ?? t("unknownPerson")}
            </bdi>
            {n.user.email ? (
              <bdi dir="ltr" className="mds-caption font-mono">
                {n.user.email}
              </bdi>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "grants",
      header: t("columns.grants"),
      width: "27%",
      render: (n) => {
        const held = heldGroupsOf(n);
        const codes = orderByCatalog(
          n.permissions.map((p) => p.code),
          catalog?.platform ?? null
        );
        if (held.length === 0 && codes.length === 0) {
          return <span className="text-neutral-muted">{t("noGrants")}</span>;
        }
        return (
          <span className="flex flex-col items-start gap-2">
            {held.map((g) => (
              <span key={g.id} className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" icon={<Icon name="key" size="sm" />}>
                  {g.name}
                  <span className="mds-visually-hidden">
                    {" "}
                    {t("groupSuffix")}
                  </span>
                </Badge>
                {g.scope === "ALL_COURSES" ? (
                  <span className="mds-caption">{t("everyCourse")}</span>
                ) : g.scope === "COURSE" ? (
                  <bdi className="mds-caption">{g.courseTitle}</bdi>
                ) : null}
              </span>
            ))}
            {codes.length > 0 ? (
              <span className="mds-caption" data-testid="single-permissions">
                {held.length > 0
                  ? t("andPermissions", { list: codes.map(short).join(", ") })
                  : codes.map(short).join(", ")}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "end",
      header: t("columns.end"),
      width: "13%",
      render: (n) => {
        const label = endLabel(n.expiresAt, now ?? new Date(), {
          locale,
          timeZone,
        });
        if (label.kind === "never") {
          return <span className="mds-caption">{t("never")}</span>;
        }
        return (
          <span className="flex flex-col">
            <span>{label.date}</span>
            {label.warnDays !== null ? (
              <span className="mds-caption" data-testid="days-left">
                {label.warnDays === 0
                  ? t("endsToday")
                  : t("daysLeft", { count: label.warnDays })}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "giver",
      header: t("columns.giver"),
      width: "14%",
      render: (n) => (
        <span className="flex flex-col">
          <bdi>{n.appointedBy?.name ?? t("unknownPerson")}</bdi>
          <span className="mds-caption">
            {formatDay(n.appointedAt, locale, timeZone)}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "24%",
      render: (n) => (
        <span className="flex flex-nowrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="small"
            disabled={!ready}
            aria-label={t("editLabel", { name: n.user.name ?? "" })}
            onClick={() => setEditing(n)}
          >
            {t("edit")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            disabled={!gateOpen}
            aria-label={t("dismissLabel", { name: n.user.name ?? "" })}
            onClick={() => setDismissing(n)}
          >
            {t("dismiss")}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="nazims"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[60rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <Button
          iconLeft={<Icon name="plus" size="sm" />}
          disabled={!ready}
          onClick={() => setAppointing(true)}
        >
          {t("appoint")}
        </Button>
      </header>

      <section aria-labelledby="nazims-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="nazims-heading" className="mds-h2">
            {t("heading")}
          </h2>
          {nazims ? (
            <span className="mds-caption" data-testid="nazim-count">
              {t("count", { count: nazims.length })}
            </span>
          ) : null}
        </div>
        {nazims === null || !ready ? (
          <Alert tone="error" title={t("loadFailedTitle")}>
            <p>{t("loadFailed")}</p>
            <Button variant="outline" size="small" onClick={refresh}>
              {t("retry")}
            </Button>
          </Alert>
        ) : (
          <Table
            caption={t("caption")}
            columns={columns}
            rows={nazims}
            rowKey={(n) => n.user.id}
            empty={t("empty")}
            responsive="stack"
          />
        )}
      </section>

      {ready ? (
        <>
          <PermissionsDialog
            open={appointing}
            onOpenChange={setAppointing}
            nazim={null}
            catalog={catalog}
            groups={groups}
            onSaved={refresh}
          />
          <PermissionsDialog
            open={editing !== null}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
            nazim={editing}
            catalog={catalog}
            groups={groups}
            onSaved={refresh}
          />
        </>
      ) : null}
      <DismissDialog
        open={dismissing !== null}
        onOpenChange={(open) => {
          if (!open) setDismissing(null);
        }}
        nazim={dismissing}
        onDismissed={refresh}
      />
    </div>
  );
}
