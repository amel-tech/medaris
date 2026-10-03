"use client";

import type { KoskNazimResponse } from "@medaris/services/tedrisat";
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
import { grantedOn } from "../../hosting/present";
import { koskCase, type Messages, termLabel } from "../admin-present";
import { AddNazimDialog } from "./add-nazim-dialog";

interface Props {
  koskId: string;
  koskName: string;
  /** null when the first read failed */
  nazims: KoskNazimResponse[] | null;
  /** the signed-in person, for the "Siz" under their own row */
  viewerId: string | null;
  /** the başnazım adds nazımları; a köşk nazımı only reads the list */
  chief: boolean;
  hostingCount?: number;
}

const ABILITIES = ["1", "2", "3", "4", "5", "6"] as const;

/**
 * Köşk nazımları (nizam 25, with nizam/21's dialog): who runs the köşk, who
 * gave each the post, when, and until when. The list is read-only — the Medaris
 * yönetimi appoints, and the page says so to a köşk nazımı; the başnazım gets
 * "Köşk nazımı ekle" instead. Beside it, what a köşk nazımı can do here. The
 * tab strip links the köşk's other settings pages.
 */
export function NazimsView({
  koskId,
  koskName,
  nazims,
  viewerId,
  chief,
  hostingCount,
}: Props) {
  const tm = useTranslations("nizam.KoskNazims");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const refresh = () => startTransition(() => router.refresh());
  const base = `/${locale}/kosks/${koskId}/ayarlar`;
  const held = nazims ?? [];
  // With the API down the köşk's name may not be known; the page still draws.
  const name = koskName || t("unknownKosk");
  const accusative = koskName
    ? koskCase(koskName, locale, "accusative")
    : t("unknownKosk");

  const columns: TableColumn<KoskNazimResponse>[] = [
    {
      key: "nazim",
      header: t("columns.nazim"),
      rowHeader: true,
      width: "34%",
      render: (n) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={n.user.name ?? n.user.email ?? ""} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">
              {n.user.name ?? n.user.email ?? t("unknownPerson")}
            </bdi>
            {viewerId && n.user.id.toLowerCase() === viewerId.toLowerCase() ? (
              <span className="mds-caption">{t("you")}</span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "grantedBy",
      header: t("columns.grantedBy"),
      width: "28%",
      render: (n) => (
        <span className="flex flex-col">
          <bdi>{n.grantedBy.name ?? t("unknownPerson")}</bdi>
          {n.grantedByRole ? (
            <span className="mds-caption">{t(`roles.${n.grantedByRole}`)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "grantedAt",
      header: t("columns.grantedAt"),
      width: "20%",
      render: (n) => (
        <span className="whitespace-nowrap">
          {grantedOn(n.grantedAt, { locale, timeZone })}
        </span>
      ),
    },
    {
      key: "term",
      header: t("columns.term"),
      width: "18%",
      render: (n) => (
        <span className="whitespace-nowrap">
          {termLabel(n.endsAt, {
            locale,
            timeZone,
            unlimited: t("unlimited"),
          })}
        </span>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      data-testid="kosk-nazims"
    >
      <Breadcrumb
        label={t("breadcrumbLabel")}
        items={
          chief
            ? [
                { label: t("kosks"), href: `/${locale}/kosks` },
                { label: name, href: `/${locale}/kosks/${koskId}` },
                t("title"),
              ]
            : [{ label: t("settings"), href: base }, t("title")]
        }
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro", { koskAccusative: accusative })}</p>
        </div>
        {chief ? (
          <Button
            iconLeft={<Icon name="plus" size="sm" />}
            onClick={() => setAdding(true)}
          >
            {t("add")}
          </Button>
        ) : null}
      </header>

      <Tabs
        mode="links"
        label={t("tabsLabel")}
        locale={locale}
        value="nazims"
        tabs={[
          { value: "general", label: t("tabs.general"), href: base },
          {
            value: "nazims",
            label: t("tabs.nazims"),
            href: `${base}/nazimlar`,
            count: nazims ? held.length : undefined,
          },
          {
            value: "hosting",
            label: t("tabs.hosting"),
            href: `${base}/barindirma`,
            count: hostingCount,
          },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          {chief ? null : <Alert tone="neutral">{t("readOnly")}</Alert>}
          {nazims === null ? (
            <Alert tone="error" title={t("loadFailedTitle")}>
              <p>{t("loadFailed")}</p>
              <Button variant="outline" size="small" onClick={refresh}>
                {t("retry")}
              </Button>
            </Alert>
          ) : (
            <Table
              caption={t("caption", { kosk: name })}
              columns={columns}
              rows={held}
              rowKey={(n) => n.user.id}
              empty={t("empty")}
              responsive="stack"
            />
          )}
        </div>
        <aside className="mds-card flex flex-col gap-3">
          <h2 className="mds-h2">{t("abilitiesHeading")}</h2>
          <ul className="flex flex-col">
            {ABILITIES.map((key) => (
              <li
                key={key}
                className="flex items-start gap-3 border-b border-neutral-subtle py-3 last:border-b-0"
              >
                <Icon name="check" size="sm" className="mt-1 shrink-0" />
                <span>{t(`abilities.${key}`)}</span>
              </li>
            ))}
          </ul>
          <p className="mds-caption">{t("abilitiesNote")}</p>
        </aside>
      </div>

      {chief ? (
        <AddNazimDialog
          open={adding}
          onOpenChange={setAdding}
          koskId={koskId}
          koskName={name}
          onAdded={refresh}
        />
      ) : null}
    </div>
  );
}
