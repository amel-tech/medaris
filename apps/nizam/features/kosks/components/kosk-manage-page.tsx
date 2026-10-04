"use client";

import type {
  HostingRightResponse,
  KoskCourseRowResponse,
  KoskNazimResponse,
  KoskOverviewResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { Stat } from "@medaris/ui/mds/stat";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { RevokeDialog } from "../../hosting/components/revoke-dialog";
import {
  grantedOn,
  granterRole,
  koskLocative,
  openCoursesSummary,
} from "../../hosting/present";
import { dateWithCase } from "../../madrasahs/present";
import {
  handleLabel,
  type Messages,
  STATUS_LOOK,
  termLabel,
  toneOfHue,
} from "../admin-present";
import {
  canDeactivate,
  canHide,
  courseBreakdown,
  type Messages as OverviewMessages,
} from "../overview-present";
import { AddNazimDialog } from "./add-nazim-dialog";
import { DeactivateKoskDialog } from "./deactivate-kosk-dialog";
import { HideKoskDialog } from "./hide-kosk-dialog";
import { KoskCourseTable } from "./kosk-course-table";

interface Props {
  kosk: KoskResponse;
  overview: KoskOverviewResponse;
  /** null when a read failed: that section says so in place */
  nazims: KoskNazimResponse[] | null;
  rights: HostingRightResponse[] | null;
  rows: KoskCourseRowResponse[] | null;
  viewerId: string | null;
  /** the köşk's page on tedris, or null when this deployment has none */
  koskPublicHref: string | null;
}

/**
 * Köşk — Medaris yönetimi görünümü (nizam 20): the başnazım's reading of one
 * köşk — its numbers, its details, the actions that are the Medaris
 * yönetimi's (hide, take out of service, the permanent delete that lives in
 * the Arşiv), its nazımları, the medreses that host in it and its courses.
 * Course work stays the köşk nazımı's, so the courses table has no buttons;
 * "Köşk nazımının gördüğü sayfa" opens the page the nazım works in.
 */
export function KoskManagePage({
  kosk,
  overview,
  nazims,
  rights,
  rows,
  viewerId,
  koskPublicHref,
}: Props) {
  const t = useTranslations("nizam.KoskManage");
  const tn = useTranslations("nizam.KoskNazims");
  const th = useTranslations("nizam.HostingPage");
  const td = useTranslations("nizam.KoskDirectory");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hiding, setHiding] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<HostingRightResponse | null>(null);

  const refresh = () => startTransition(() => router.refresh());
  const base = `/${locale}/kosks/${kosk.id}`;
  const status = overview.status;
  const look = STATUS_LOOK[status];
  const dateOpts = { locale, timeZone };
  const handle = handleLabel(kosk.handle);
  const unavailable = (retry: boolean) => (
    <Alert tone="error" title={t("loadFailedTitle")}>
      <p>{t("loadFailed")}</p>
      {retry ? (
        <Button variant="outline" size="small" onClick={refresh}>
          {t("retry")}
        </Button>
      ) : null}
    </Alert>
  );

  const nazimColumns: TableColumn<KoskNazimResponse>[] = [
    {
      key: "nazim",
      header: tn("columns.nazim"),
      rowHeader: true,
      width: "36%",
      render: (n) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={n.user.name ?? n.user.email ?? ""} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">
              {n.user.name ?? n.user.email ?? tn("unknownPerson")}
            </bdi>
            {n.user.email ? (
              <bdi dir="ltr" className="mds-caption font-mono">
                {n.user.email}
              </bdi>
            ) : null}
            {viewerId && n.user.id.toLowerCase() === viewerId.toLowerCase() ? (
              <span className="mds-caption">{tn("you")}</span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "grantedBy",
      header: tn("columns.grantedBy"),
      width: "26%",
      render: (n) => (
        <span className="flex flex-col">
          <bdi>{n.grantedBy.name ?? tn("unknownPerson")}</bdi>
          {n.grantedByRole ? (
            <span className="mds-caption">
              {tn(`roles.${n.grantedByRole}`)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "grantedAt",
      header: tn("columns.grantedAt"),
      width: "20%",
      render: (n) => (
        <span className="whitespace-nowrap">
          {grantedOn(n.grantedAt, dateOpts)}
        </span>
      ),
    },
    {
      key: "term",
      header: tn("columns.term"),
      width: "18%",
      render: (n) => (
        <span className="whitespace-nowrap">
          {termLabel(n.endsAt, { ...dateOpts, unlimited: tn("unlimited") })}
        </span>
      ),
    },
  ];

  const hostingColumns: TableColumn<HostingRightResponse>[] = [
    {
      key: "madrasah",
      header: th("columns.madrasah"),
      rowHeader: true,
      width: "26%",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} entity decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{r.name}</bdi>
            <bdi className="mds-caption">
              {r.headMuderris
                ? th("head", {
                    name: r.headMuderris.name ?? th("unknownPerson"),
                  })
                : th("noHead")}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      key: "grantedBy",
      header: th("columns.grantedBy"),
      width: "20%",
      render: (r) => (
        <span className="flex flex-col">
          <bdi>{r.grantedBy.name ?? th("unknownPerson")}</bdi>
          <span className="mds-caption">
            {granterRole(r.grantedBy.role, th as unknown as Messages)}
          </span>
        </span>
      ),
    },
    {
      key: "grantedAt",
      header: th("columns.grantedAt"),
      width: "14%",
      render: (r) => (
        <span className="whitespace-nowrap">
          {grantedOn(r.grantedAt, dateOpts)}
        </span>
      ),
    },
    {
      key: "openCourses",
      header: th("columns.openCourses"),
      align: "right",
      width: "14%",
      render: (r) => (
        <span className="flex flex-col items-end">
          <span className="tabular-nums">{r.openCourses.length}</span>
          <span className="mds-caption">
            {openCoursesSummary(r.openCourses, th as unknown as Messages)}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{th("columns.actions")}</span>
      ),
      align: "right",
      width: "26%",
      render: (r) => (
        <Button
          variant="outline"
          size="small"
          aria-label={th("revokeLabel", { name: r.name })}
          onClick={() => setRevoking(r)}
        >
          {th("revoke")}
        </Button>
      ),
    },
  ];

  const policies = [
    kosk.alwaysRequireApproval ? t("policyApproval") : null,
    kosk.recordingsNeverPublic ? t("policyRecordings") : null,
  ].filter((p): p is string => p !== null);

  const info: { key: string; label: string; value: React.ReactNode }[] = [
    { key: "name", label: t("info.name"), value: <bdi>{kosk.name}</bdi> },
    {
      key: "handle",
      label: t("info.handle"),
      value: handle ? (
        <bdi dir="ltr" className="font-mono">
          {handle}
        </bdi>
      ) : (
        "—"
      ),
    },
    {
      key: "description",
      label: t("info.description"),
      value: kosk.description ?? "—",
    },
    {
      key: "status",
      label: t("info.status"),
      value: look.badge ? (
        <Badge variant={look.badge}>{td(`status.${status}`)}</Badge>
      ) : (
        <span className="inline-flex items-center gap-2">
          {look.icon ? <Icon name={look.icon} size="sm" /> : null}
          {td(`status.${status}`)}
        </span>
      ),
    },
    {
      key: "visibility",
      label: t("info.visibility"),
      value: kosk.isPrivate ? t("unlisted") : t("listed"),
    },
    {
      key: "opened",
      label: t("info.opened"),
      value: [
        new Intl.DateTimeFormat(locale, {
          timeZone,
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(overview.openedAt)),
        overview.openedBy?.name,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      key: "policy",
      label: t("info.policy"),
      value: policies.length > 0 ? policies.join("; ") : t("policyNone"),
    },
  ];

  const hiddenSince =
    status !== "ACTIVE" && overview.since
      ? td("since", {
          dateAblative: dateWithCase(
            new Date(overview.since),
            "ablative",
            dateOpts
          ),
        })
      : null;

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-manage"
    >
      <Breadcrumb
        label={t("breadcrumbLabel")}
        items={[{ label: t("kosks"), href: `/${locale}/kosks` }, kosk.name]}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="mds-h1">
            <bdi>{kosk.name}</bdi>
          </h1>
          <p>{handle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" href={`${base}/dersler`}>
            {t("nazimView")}
          </Button>
          {koskPublicHref ? (
            <Button
              variant="outline"
              href={koskPublicHref}
              target="_blank"
              rel="noopener noreferrer"
              iconRight={<Icon name="externalLink" size="sm" />}
            >
              {t("publicPage")}
              <span className="mds-visually-hidden"> {t("newTab")}</span>
            </Button>
          ) : null}
        </div>
      </header>

      <Alert tone="neutral">{t("notice")}</Alert>
      {hiddenSince ? (
        <Alert tone="warning">
          {status === "HIDDEN"
            ? t("hiddenNote", { since: hiddenSince })
            : t("passiveNote", { since: hiddenSince })}
        </Alert>
      ) : null}

      <section
        aria-label={t("summaryLabel")}
        className="grid gap-grid sm:grid-cols-2 lg:grid-cols-4"
      >
        <Stat
          label={t("stats.courses")}
          value={overview.courses.all}
          locale={locale}
        >
          <span className="mds-caption">
            {courseBreakdown(
              overview.courses,
              t as unknown as OverviewMessages
            )}
          </span>
        </Stat>
        <Stat
          label={t("stats.students")}
          value={overview.students}
          locale={locale}
        >
          <span className="mds-caption">{t("stats.studentsNote")}</span>
        </Stat>
        <Stat
          label={t("stats.nazims")}
          value={overview.nazimCount}
          locale={locale}
        >
          <span className="mds-caption">
            {overview.nazimCount === 0
              ? t("stats.nazimsNone")
              : overview.nazimCount === 1
                ? t("stats.nazimsOne")
                : t("stats.nazimsMany")}
          </span>
        </Stat>
        <Stat
          label={t("stats.hosting")}
          value={overview.hostingMadrasahs.length}
          locale={locale}
        >
          <span className="mds-caption">
            {overview.hostingMadrasahs.map((m) => m.name).join(", ") ||
              t("stats.hostingNone")}
          </span>
        </Stat>
      </section>

      <div className="grid items-start gap-grid lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section
          aria-labelledby="info-heading"
          className="mds-card flex flex-col gap-4"
        >
          <div className="flex items-center gap-3">
            <CoverPattern tone={toneOfHue(kosk.coverHue)} size="xs" />
            <h2 id="info-heading" className="mds-h2">
              {t("infoHeading")}
            </h2>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {info.map((row) => (
              <div
                key={row.key}
                className={
                  row.key === "description"
                    ? "flex flex-col gap-1 sm:col-span-2"
                    : "flex flex-col gap-1"
                }
              >
                <dt className="mds-caption">{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <a className="mds-link" href={`${base}/ayarlar`}>
              {t("openSettings")}
            </a>
          </div>
        </section>

        <section
          aria-labelledby="actions-heading"
          className="mds-card flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 id="actions-heading" className="mds-h2">
              {t("actionsHeading")}
            </h2>
            <p className="mds-caption">{t("actionsIntro")}</p>
          </div>
          <div className="flex flex-col divide-y divide-[var(--border-neutral-subtle)]">
            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{t("hideHeading")}</h3>
                <p className="mds-caption">{t("hideBody")}</p>
              </div>
              <Button
                variant="outline"
                size="small"
                disabled={!canHide(status)}
                onClick={() => setHiding(true)}
              >
                {t("hide")}
              </Button>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{t("deactivateHeading")}</h3>
                <p className="mds-caption">{t("deactivateBody")}</p>
              </div>
              <Button
                variant="outline"
                size="small"
                disabled={!canDeactivate(status)}
                onClick={() => setDeactivating(true)}
              >
                {t("deactivate")}
              </Button>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{t("deleteHeading")}</h3>
                <p className="mds-caption">{t("deleteBody")}</p>
              </div>
              <Button variant="link" size="small" href={`/${locale}/arsiv`}>
                {t("toArchive")}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="nazims-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="nazims-heading" className="mds-h2">
            {t("nazimsHeading")}
          </h2>
          <Button
            iconLeft={<Icon name="plus" size="sm" />}
            onClick={() => setAdding(true)}
          >
            {tn("add")}
          </Button>
        </div>
        {nazims === null ? (
          unavailable(true)
        ) : (
          <Table
            caption={t("nazimsCaption")}
            columns={nazimColumns}
            rows={nazims}
            rowKey={(n) => n.user.id}
            empty={tn("empty")}
            responsive="stack"
          />
        )}
      </section>

      <section
        aria-labelledby="hosting-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="hosting-heading" className="mds-h2">
            {t("hostingHeading")}
          </h2>
          <a className="mds-link" href={`${base}/ayarlar/barindirma`}>
            {t("hostingLink")}
          </a>
        </div>
        <p className="mds-caption">{t("hostingIntro")}</p>
        {rights === null ? (
          unavailable(true)
        ) : (
          <Table
            caption={th("caption", {
              kosk: kosk.name,
              koskLocative: koskLocative(kosk.name, locale),
            })}
            columns={hostingColumns}
            rows={rights}
            rowKey={(r) => r.madrasahId}
            empty={th("empty")}
            responsive="stack"
          />
        )}
      </section>

      <section
        aria-labelledby="courses-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="courses-heading" className="mds-h2">
            {t("coursesHeading")}
          </h2>
          <a className="mds-link" href={`${base}/arsiv`}>
            {t("archive")}
          </a>
        </div>
        <p className="mds-caption">{t("coursesIntro")}</p>
        {rows === null ? (
          unavailable(true)
        ) : (
          <KoskCourseTable
            koskId={kosk.id}
            rows={rows}
            mode="manage"
            caption={t("coursesCaption")}
          />
        )}
        <p className="mds-caption">{t("hiddenInArchive")}</p>
      </section>

      <HideKoskDialog
        open={hiding}
        onOpenChange={setHiding}
        koskId={kosk.id}
        koskName={kosk.name}
        onHidden={refresh}
      />
      <DeactivateKoskDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        koskId={kosk.id}
        koskName={kosk.name}
        nazimCount={overview.nazimCount}
        onDeactivated={refresh}
      />
      <AddNazimDialog
        open={adding}
        onOpenChange={setAdding}
        koskId={kosk.id}
        koskName={kosk.name}
        onAdded={refresh}
      />
      <RevokeDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        koskId={kosk.id}
        koskName={kosk.name}
        right={revoking}
        onRevoked={refresh}
      />
    </div>
  );
}
