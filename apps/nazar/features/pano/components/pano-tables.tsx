"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { approveApplication, rejectApplication } from "../actions";
import {
  type ApplicationRow,
  applicationGone,
  decisionErrorKey,
  pendingCounts,
  type SessionRow,
} from "../pano";

/**
 * "Yaklaşan celseler" (nazir 01): the sessions of the next seven days, the
 * soonest first. A celse with no link yet says so; the platform is read from
 * the link's host. "Düzenle" opens the course's celseler where the caller holds
 * a scope in the course, and is left out where they do not.
 */
export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  const t = useTranslations("nazir");

  const columns: TableColumn<SessionRow>[] = [
    {
      key: "course",
      header: t("Pano.sessions.columns.course"),
      rowHeader: true,
      width: "36%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <CoverPattern seed={row.courseId} size="xs" label="" />
          <span className="flex min-inline-0 flex-col">
            <bdi className="font-reading font-semibold">{row.title}</bdi>
            <span className="mds-caption">
              <bdi>{row.meta}</bdi>
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "time",
      header: t("Pano.sessions.columns.time"),
      width: "20%",
      render: (row) => (
        <time className="whitespace-nowrap" dateTime={row.time.iso}>
          {row.time.label}
        </time>
      ),
    },
    {
      key: "platform",
      header: t("Pano.sessions.columns.platform"),
      width: "20%",
      render: (row) =>
        row.platform ? (
          <PlatformChip
            platform={row.platform.id}
            host={row.platform.host}
            unknownLabel={t("Pano.sessions.unknownPlatform")}
          />
        ) : (
          <Badge variant="warning" icon={<Icon name="warning" size="sm" />}>
            {t("Pano.sessions.noLink")}
          </Badge>
        ),
    },
    {
      key: "status",
      header: t("Pano.sessions.columns.status"),
      width: "12%",
      render: () => (
        <Badge variant="secondary">{t("Pano.sessions.planned")}</Badge>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Pano.sessions.columns.actions")}
        </span>
      ),
      align: "right",
      width: "12%",
      render: (row) =>
        row.editHref ? (
          <Button
            href={row.editHref}
            variant="outline"
            size="small"
            aria-label={t("Pano.sessions.editLabel", { title: row.title })}
          >
            {t("Pano.sessions.edit")}
          </Button>
        ) : null,
    },
  ];

  return (
    <Table
      caption={t("Pano.sessions.caption")}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      empty={t("Pano.sessions.empty")}
      responsive="stack"
    />
  );
}

type Decision = "approve" | "reject";

/**
 * "Bekleyen başvurular" (nazir 01): the applications waiting in the medrese's
 * courses, newest first, with the counter above them. "Onayla" and "Reddet" are
 * drawn only on the rows the API says the caller may decide (the course's
 * müderris, the köşk's nazım, the sistem yöneticisi), the buttons of a row stay
 * off while its call runs, and a row that is decided leaves the list and the
 * counter at once while the dashboard is read again. The API takes no reason
 * for a rejection, so "Reddet" asks once before it acts. An application that is
 * no longer waiting leaves the list with a notice, not an error.
 */
export function ApplicationsPanel({
  rows,
  total,
  courses,
}: {
  rows: ApplicationRow[];
  /** every application waiting, which can be more than the rows */
  total: number;
  /** the courses that hold one */
  courses: number;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [, startTransition] = useTransition();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<{ key: string; action: Decision } | null>(
    null
  );
  const [rejecting, setRejecting] = useState<ApplicationRow | null>(null);

  const counts = pendingCounts({ total, courses }, rows, removed);
  const left = rows.filter((row) => !removed.has(row.key));

  const decide = (row: ApplicationRow, action: Decision) => {
    setBusy({ key: row.key, action });
    startTransition(async () => {
      const result = await (action === "approve"
        ? approveApplication
        : rejectApplication)(row.courseId, row.userId);
      if (result.success) {
        notify({
          title: t(
            action === "approve"
              ? "Pano.applications.approved"
              : "Pano.applications.rejected"
          ),
          description: t(
            action === "approve"
              ? "Pano.applications.approvedBody"
              : "Pano.applications.rejectedBody",
            { name: row.name, course: row.courseTitle }
          ),
        });
      } else {
        notify({
          tone: applicationGone(result.code) ? "info" : "error",
          title: t("Pano.applications.failedTitle"),
          description: words(decisionErrorKey(result.code)),
        });
      }
      if (result.success || applicationGone(result.code)) {
        setRemoved((current) => new Set(current).add(row.key));
        router.refresh();
      }
      setBusy(null);
    });
  };

  const columns: TableColumn<ApplicationRow>[] = [
    {
      key: "student",
      header: t("Pano.applications.columns.student"),
      rowHeader: true,
      width: "50%",
      render: (row) => (
        <span className="flex min-inline-0 flex-col">
          <bdi className="font-medium">{row.name}</bdi>
          <span className="mds-caption">
            <bdi>{row.courseTitle}</bdi>
          </span>
        </span>
      ),
    },
    {
      key: "at",
      header: t("Pano.applications.columns.at"),
      width: "20%",
      render: (row) => (
        <time className="whitespace-nowrap" dateTime={row.at.iso}>
          {row.at.label}
        </time>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Pano.applications.columns.actions")}
        </span>
      ),
      align: "right",
      width: "30%",
      render: (row) => {
        if (!row.mayDecide) return null;
        const mine = busy?.key === row.key ? busy.action : null;
        return (
          <span className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="small"
              loading={mine === "approve"}
              disabled={mine === "reject"}
              aria-label={t("Pano.applications.approveLabel", {
                name: row.name,
              })}
              onClick={() => decide(row, "approve")}
            >
              {t("Pano.applications.approve")}
            </Button>
            <Button
              variant="ghost"
              size="small"
              loading={mine === "reject"}
              disabled={mine === "approve"}
              aria-label={t("Pano.applications.rejectLabel", {
                name: row.name,
              })}
              onClick={() => setRejecting(row)}
            >
              {t("Pano.applications.reject")}
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <section
      aria-labelledby="applications-heading"
      className="flex min-inline-0 flex-col gap-4"
      data-testid="applications"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="mds-h2" id="applications-heading">
          {t("Pano.applications.title")}
        </h2>
        <p className="mds-caption" data-testid="applications-counter">
          {t("Pano.applications.hint", counts)}
        </p>
      </div>
      <Table
        caption={t("Pano.applications.caption")}
        columns={columns}
        rows={left}
        rowKey={(row) => row.key}
        empty={t("Pano.applications.empty")}
        responsive="stack"
      />
      {total > rows.length ? (
        <p className="mds-caption">
          {t("Pano.applications.more", { count: rows.length })}
        </p>
      ) : null}
      {rejecting ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setRejecting(null);
          }}
          title={t("Pano.applications.rejectTitle")}
          confirmLabel={t("Pano.applications.reject")}
          cancelLabel={t("Pano.applications.rejectCancel")}
          closeLabel={t("Shell.close")}
          onConfirm={() => {
            const row = rejecting;
            setRejecting(null);
            decide(row, "reject");
          }}
        >
          <p>
            {t("Pano.applications.rejectBody", {
              name: rejecting.name,
              course: rejecting.courseTitle,
            })}
          </p>
        </AlertDialog>
      ) : null}
    </section>
  );
}
