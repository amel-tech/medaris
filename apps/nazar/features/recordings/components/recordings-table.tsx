"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { whenLabel } from "../../sessions/sessions";
import {
  chipOf,
  hostOf,
  type SessionSlot,
  slotCounts,
  slotState,
  type WeekBlock,
} from "../recordings";
import { RecordingDialog } from "./recording-dialog";

/**
 * The weeks of Ders kayıtları, newest first, each a table of its sessions and
 * the recording each holds: its title, where it lives (the provider chip, or
 * the host when it has no name), whether it plays yet and who may watch it. A
 * session that has begun and has none offers "Kayıt ekle"; a recording offers
 * "Düzenle". Both open the one dialog. The clock is read here and moves while
 * the page is open, as on Celseler.
 */
export function RecordingsTable({
  blocks,
  closed,
  locale,
  timeZone,
}: {
  blocks: WeekBlock[];
  /** the course is closed: nothing is opened to everyone */
  closed: boolean;
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations("nazar");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [target, setTarget] = useState<SessionSlot | null>(null);

  const counts = slotCounts(blocks, now);
  const refresh = () => startTransition(() => router.refresh());
  const dash = <span aria-hidden="true">—</span>;

  const columns: TableColumn<SessionSlot>[] = [
    {
      key: "session",
      header: t("Recordings.columns.session"),
      rowHeader: true,
      width: "22%",
      render: (slot) => (
        <span className="flex min-inline-0 flex-col gap-1">
          <span className="font-semibold">
            <bdi>{slot.title}</bdi>
          </span>
          {slot.startsAt ? (
            <time className="mds-caption" dateTime={slot.startsAt}>
              {whenLabel(
                new Date(slot.startsAt),
                { locale, timeZone },
                "short"
              )}
            </time>
          ) : null}
        </span>
      ),
    },
    {
      key: "recording",
      header: t("Recordings.columns.recording"),
      width: "30%",
      render: (slot) => {
        const recording = slot.recording;
        if (!recording) {
          const state = slotState(slot, now);
          return (
            <span className="text-neutral-muted">
              {state === "notYet"
                ? t("Recordings.notYet")
                : t("Recordings.none")}
            </span>
          );
        }
        const chip = chipOf(recording.provider);
        return (
          <span className="flex min-inline-0 flex-col gap-1">
            <span className="font-semibold">
              <bdi>{recording.title}</bdi>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {chip ? (
                <PlatformChip platform={chip} kind="recording" />
              ) : recording.url ? (
                <bdi dir="ltr" className="mds-caption font-mono">
                  {hostOf(recording.url)}
                </bdi>
              ) : null}
              {recording.url ? (
                <a
                  className="mds-link"
                  href={recording.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("Recordings.openLabel", {
                    title: recording.title,
                  })}
                >
                  {t("Recordings.open")}
                </a>
              ) : (
                <span className="mds-caption">{t("Recordings.noLink")}</span>
              )}
            </span>
          </span>
        );
      },
    },
    {
      key: "state",
      header: t("Recordings.columns.state"),
      width: "14%",
      render: (slot) =>
        slot.recording ? (
          <Badge
            variant={
              slot.recording.status === "READY" ? "secondary" : "warning"
            }
          >
            {t(
              slot.recording.status === "READY"
                ? "Recordings.state.ready"
                : "Recordings.state.processing"
            )}
          </Badge>
        ) : (
          dash
        ),
    },
    {
      key: "visibility",
      header: t("Recordings.columns.visibility"),
      width: "16%",
      render: (slot) =>
        slot.recording ? (
          <Badge
            variant={
              slot.recording.visibility === "PUBLIC" ? "live" : "outline"
            }
          >
            {t(
              slot.recording.visibility === "PUBLIC"
                ? "Recordings.visibility.public"
                : "Recordings.visibility.enrolled"
            )}
          </Badge>
        ) : (
          dash
        ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Recordings.columns.actions")}
        </span>
      ),
      align: "right",
      width: "18%",
      render: (slot) => {
        const state = slotState(slot, now);
        if (state === "recorded") {
          return (
            <Button
              variant="outline"
              size="small"
              aria-label={t("Recordings.editLabel", { session: slot.title })}
              onClick={() => setTarget(slot)}
            >
              {t("Recordings.edit")}
            </Button>
          );
        }
        if (state === "missing") {
          return (
            <Button
              variant="outline"
              size="small"
              aria-label={t("Recordings.addLabel", { session: slot.title })}
              onClick={() => setTarget(slot)}
            >
              {t("Recordings.add")}
            </Button>
          );
        }
        return dash;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6" data-testid="recordings">
      {blocks.length === 0 ? (
        <Alert tone="info" title={t("Recordings.emptyTitle")}>
          <p>{t("Recordings.emptyBody")}</p>
        </Alert>
      ) : (
        <>
          <p className="mds-caption" data-testid="recording-counts">
            {t("Recordings.summary", counts)}
          </p>
          {blocks.map((block) => (
            <section
              key={block.weekId}
              className="flex flex-col gap-3"
              aria-labelledby={`week-${block.weekId}`}
            >
              <h2 id={`week-${block.weekId}`} className="mds-h2">
                {block.title
                  ? t("Recordings.weekHeadingTitled", {
                      week: block.weekNumber,
                      title: block.title,
                    })
                  : t("Recordings.weekHeading", { week: block.weekNumber })}
              </h2>
              <Table
                caption={t("Recordings.weekCaption", {
                  week: block.weekNumber,
                })}
                responsive="stack"
                columns={columns}
                rows={block.slots}
                rowKey={(slot) => slot.lessonId}
              />
            </section>
          ))}
        </>
      )}
      {target ? (
        <RecordingDialog
          // a fresh form for every session and every recording it holds
          key={`${target.lessonId}-${target.recording?.id ?? "new"}`}
          slot={target}
          closed={closed}
          onClose={() => setTarget(null)}
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}
