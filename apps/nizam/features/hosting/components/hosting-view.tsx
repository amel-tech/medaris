"use client";

import type {
  HostingRightResponse,
  MadrasahResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  grantable,
  grantedOn,
  granterRole,
  koskLocative,
  type Messages,
  openCoursesSummary,
} from "../present";
import { GrantDialog } from "./grant-dialog";
import { RevokeDialog } from "./revoke-dialog";

interface Props {
  koskId: string;
  koskName: string;
  /** null when the first read failed */
  rights: HostingRightResponse[] | null;
  /** the medreses "Barındırma hakkı ver" can pick from; null when they could not be read */
  madrasahs: MadrasahResponse[] | null;
  /**
   * Draw the "Genel" and "Köşk nazımları" tabs and link the breadcrumb to the
   * settings. False for a Medaris nazımı holding only `platform.hosting_grant`,
   * for whom both of those pages are a 403 (MDRS-137).
   */
  settingsTabs?: boolean;
}

/**
 * Barındırma hakları (nizam 26): the medreses that may open courses in this
 * köşk, who gave each the right and when, and how many courses it has open
 * here. "Barındırma hakkı ver" gives one; "Barındırma hakkını geri al" is
 * nizam/27's dialog. A right gives the medrese no power over the köşk — the
 * page says so, and withdrawing one closes no course unless the dialog's
 * answer says so. The tab strip links the köşk's other settings pages, which
 * are other packages'.
 */
export function HostingView({
  koskId,
  koskName,
  rights,
  madrasahs,
  settingsTabs = true,
}: Props) {
  const tm = useTranslations("nizam.HostingPage");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<HostingRightResponse | null>(null);

  const refresh = () => startTransition(() => router.refresh());
  const base = `/${locale}/kosks/${koskId}/ayarlar`;
  const held = rights ?? [];
  // With the API down the köşk's name may not be known; the page still draws.
  const name = koskName || t("unknownKosk");
  const koskIn = koskName
    ? koskLocative(koskName, locale)
    : t("unknownKoskLocative");

  const columns: TableColumn<HostingRightResponse>[] = [
    {
      key: "madrasah",
      header: t("columns.madrasah"),
      rowHeader: true,
      width: "28%",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} entity decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{r.name}</bdi>
            <bdi className="mds-caption">
              {r.headMuderris
                ? t("head", { name: r.headMuderris.name ?? t("unknownPerson") })
                : t("noHead")}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      key: "grantedBy",
      header: t("columns.grantedBy"),
      width: "20%",
      render: (r) => (
        <span className="flex flex-col">
          <bdi>{r.grantedBy.name ?? t("unknownPerson")}</bdi>
          <span className="mds-caption">
            {granterRole(r.grantedBy.role, t)}
          </span>
        </span>
      ),
    },
    {
      key: "grantedAt",
      header: t("columns.grantedAt"),
      width: "13%",
      render: (r) => (
        <span className="whitespace-nowrap">
          {grantedOn(r.grantedAt, { locale, timeZone })}
        </span>
      ),
    },
    {
      key: "openCourses",
      header: t("columns.openCourses"),
      align: "right",
      width: "13%",
      render: (r) => (
        <span className="flex flex-col items-end">
          <span className="tabular-nums">{r.openCourses.length}</span>
          <span className="mds-caption">
            {openCoursesSummary(r.openCourses, t)}
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
      width: "26%",
      render: (r) => (
        <Button
          variant="outline"
          size="small"
          aria-label={t("revokeLabel", { name: r.name })}
          onClick={() => setRevoking(r)}
        >
          {t("revoke")}
        </Button>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      data-testid="hosting"
    >
      <Breadcrumb
        label={t("breadcrumbLabel")}
        items={[
          settingsTabs ? { label: t("settings"), href: base } : t("settings"),
          t("title"),
        ]}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro", { kosk: name, koskLocative: koskIn })}</p>
        </div>
        <Button
          iconLeft={<Icon name="plus" size="sm" />}
          onClick={() => setGranting(true)}
        >
          {t("grant")}
        </Button>
      </header>

      {settingsTabs && (
        <Tabs
          mode="links"
          label={t("tabsLabel")}
          locale={locale}
          value="hosting"
          tabs={[
            { value: "general", label: t("tabs.general"), href: base },
            {
              value: "nazims",
              label: t("tabs.nazims"),
              href: `${base}/nazimlar`,
            },
            {
              value: "hosting",
              label: t("tabs.hosting"),
              href: `${base}/barindirma`,
              count: rights ? held.length : undefined,
            },
          ]}
        />
      )}

      {rights === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button variant="outline" size="small" onClick={refresh}>
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <>
          <Table
            caption={t("caption", { kosk: name, koskLocative: koskIn })}
            columns={columns}
            rows={held}
            rowKey={(r) => r.madrasahId}
            empty={t("empty")}
            responsive="stack"
          />
          <p className="mds-caption">{t("footnote")}</p>
        </>
      )}

      <GrantDialog
        open={granting}
        onOpenChange={setGranting}
        koskId={koskId}
        koskName={name}
        options={madrasahs === null ? null : grantable(madrasahs, held)}
        onGranted={refresh}
      />
      <RevokeDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        koskId={koskId}
        koskName={name}
        right={revoking}
        onRevoked={refresh}
      />
    </div>
  );
}
