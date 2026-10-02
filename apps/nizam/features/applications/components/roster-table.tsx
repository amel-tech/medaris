"use client";

import {
  type RosterEnrollmentResponse as Enrollment,
  TeamSettableEnrollmentStatus,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Progress } from "@medaris/ui/mds/progress";
import { Table, type TableColumn, type TableSort } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  BanDialog,
  type BanTarget,
} from "~/features/bans/components/ban-dialog";
import {
  LiftDialog,
  type LiftTarget,
} from "~/features/bans/components/lift-dialog";
import { setEnrollmentStatus } from "~/features/kosks/actions/courses";
import { courseTeamErrorKey } from "~/features/kosks/course-team";
import {
  filterRoster,
  ROSTER_PAGE,
  type StudentAction,
  sortRoster,
  studentActions,
} from "../present";
import { RemoveDialog, type RemoveTarget } from "./remove-dialog";

interface Props {
  variant: "enrolled" | "completed";
  koskId: string;
  koskName: string;
  courseId: string;
  courseTitle: string;
  list: Enrollment[];
  mayBanKosk: boolean;
  nextSessionAt: string | null;
  empty: string;
}

/**
 * The Kayıtlı and Tamamlayanlar tables of a course's Talebeler page (nizam
 * 58): search by name or e-mail, the talebe's own progress, and per row
 * "Tamamladı say", "Dersten çıkar" and "Yasakla" (the last two as the design
 * draws them: quiet, after the one primary action). Six rows at a time, "Daha
 * fazla göster" for the rest; the list is the one the page read, so the
 * search and the paging are the browser's.
 */
export function RosterTable({
  variant,
  koskId,
  koskName,
  courseId,
  courseTitle,
  list,
  mayBanKosk,
  nextSessionAt,
  empty,
}: Props) {
  const t = useTranslations("nizam.StudentsRoster");
  const tt = useTranslations("nizam");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(ROSTER_PAGE);
  const [sort, setSort] = useState<TableSort>({
    key: "student",
    direction: "ascending",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);
  const [banning, setBanning] = useState<BanTarget | null>(null);
  const [lifting, setLifting] = useState<LiftTarget | null>(null);

  const nameOf = (e: Enrollment) =>
    e.studentName?.trim() || e.studentEmail || t("unnamed");

  const matches = sortRoster(filterRoster(list, search), sort.direction);
  const shown = matches.slice(0, visible);

  const move = async (
    e: Enrollment,
    status: TeamSettableEnrollmentStatus,
    done: "completed" | "reopened"
  ) => {
    setBusyId(e.userId);
    const result = await setEnrollmentStatus(
      koskId,
      courseId,
      e.userId,
      status
    );
    setBusyId(null);
    if (!result.success) {
      const key = courseTeamErrorKey(result.errorBody);
      toast.error(t("actionFailed"), {
        description: key ? tt(key) : result.error,
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t(done), {
      description: t(`${done}Body`, { name: nameOf(e) }),
    });
    router.refresh();
  };

  const act = (e: Enrollment, action: StudentAction) => {
    switch (action) {
      case "complete":
        return void move(
          e,
          TeamSettableEnrollmentStatus.Completed,
          "completed"
        );
      case "reopen":
        return void move(e, TeamSettableEnrollmentStatus.Enrolled, "reopened");
      case "remove":
        return setRemoving({ userId: e.userId, name: nameOf(e) });
      case "ban":
        return setBanning({
          userId: e.userId,
          name: nameOf(e),
          email: e.studentEmail ?? null,
        });
      case "lift":
        if (!e.ban) return undefined;
        return setLifting({
          banId: e.ban.id,
          name: nameOf(e),
          email: e.studentEmail ?? null,
          courseTitle,
        });
    }
  };

  const columns: TableColumn<Enrollment>[] = [
    {
      key: "student",
      header: t("columns.student"),
      rowHeader: true,
      sortable: true,
      width: "20%",
      render: (e) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={nameOf(e)} decorative />
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <bdi className="font-semibold">{nameOf(e)}</bdi>
            {e.ban ? (
              <Badge variant="error">
                {t(e.ban.scope === "KOSK" ? "bannedKosk" : "bannedCourse")}
              </Badge>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "email",
      header: t("columns.email"),
      width: "25%",
      render: (e) =>
        e.studentEmail ? (
          <bdi
            dir="ltr"
            title={e.studentEmail}
            className="block font-mono [overflow-wrap:anywhere]"
          >
            {e.studentEmail}
          </bdi>
        ) : null,
    },
    {
      key: "joined",
      header: t("columns.joined"),
      width: "10%",
      render: (e) => (
        <span className="whitespace-nowrap">
          {format.dateTime(new Date(e.createdAt), { dateStyle: "medium" })}
        </span>
      ),
    },
    {
      key: "progress",
      header: t("columns.progress"),
      width: "12%",
      render: (e) => (
        <Progress
          value={e.progress}
          label={t("progressLabel", { name: nameOf(e) })}
          showValue
          completeLabel={t("progressDone")}
          locale={locale}
          labelHidden
        />
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "33%",
      render: (e) => {
        const name = nameOf(e);
        const busy = busyId === e.userId;
        return (
          <span className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
            {studentActions(e.status, e.ban !== null).map((action, index) => (
              <Button
                key={action}
                variant={index === 0 ? "outline" : "ghost"}
                size="small"
                loading={busy && (action === "complete" || action === "reopen")}
                disabled={busy}
                aria-label={t(`${action}Label`, { name })}
                onClick={() => act(e, action)}
              >
                {t(action)}
              </Button>
            ))}
          </span>
        );
      },
    },
  ];

  const caption = t(
    variant === "enrolled" ? "captionEnrolled" : "captionCompleted",
    {
      course: courseTitle,
    }
  );

  return (
    <div className="flex flex-col gap-4" data-testid={`roster-${variant}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-[16rem] max-w-[26rem] flex-1">
          <Field>
            <Input
              type="search"
              name="q"
              aria-label={t("searchLabel")}
              placeholder={t("searchPlaceholder")}
              leading={<Icon name="search" size="sm" />}
              value={search}
              autoComplete="off"
              onChange={(e) => {
                setSearch(e.target.value);
                setVisible(ROSTER_PAGE);
              }}
            />
          </Field>
        </div>
        {variant === "enrolled" ? (
          <p className="mds-caption max-w-[26rem] text-end">
            {t("rosterHelp")}
          </p>
        ) : null}
      </div>

      <Table
        caption={caption}
        columns={columns}
        rows={shown}
        rowKey={(e) => e.userId}
        sort={sort}
        onSortChange={(next) => setSort(next)}
        empty={list.length === 0 ? empty : t("emptySearch")}
        responsive="stack"
      />

      {list.length > 0 && matches.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="mds-caption" data-testid="roster-showing">
            {t("showing", { shown: shown.length, total: matches.length })}
          </p>
          {matches.length > shown.length ? (
            <Button
              variant="ghost"
              onClick={() => setVisible((n) => n + ROSTER_PAGE)}
            >
              {t("more")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <RemoveDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        koskId={koskId}
        course={{ id: courseId, title: courseTitle }}
        target={removing}
        onRemoved={() => {
          setRemoving(null);
          router.refresh();
        }}
      />
      <BanDialog
        open={banning !== null}
        onOpenChange={(open) => {
          if (!open) setBanning(null);
        }}
        student={banning}
        course={{ id: courseId, title: courseTitle }}
        koskName={koskName}
        mayBanKosk={mayBanKosk}
        nextSessionAt={nextSessionAt}
        onBanned={() => router.refresh()}
      />
      <LiftDialog
        open={lifting !== null}
        onOpenChange={(open) => {
          if (!open) setLifting(null);
        }}
        target={lifting}
        onLifted={() => router.refresh()}
      />
    </div>
  );
}
