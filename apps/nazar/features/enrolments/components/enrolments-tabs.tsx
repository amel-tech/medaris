"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { approveApplication, rejectApplication } from "~/features/pano/actions";
import { applicationGone, decisionErrorKey } from "~/features/pano/pano";
import type { Messages } from "~/lib/i18n/messages";
import type {
  ApplicationRow,
  Lists,
  RemovedRow,
  RosterPermissions,
  Tab,
} from "../enrolments";
import { RemovedTable } from "./removed-table";
import { RosterTable } from "./roster-table";

type Decision = "approve" | "reject";

/**
 * The tabs of a course's Talebeler: Başvurular first, where a waiting
 * application is approved or rejected; Kayıtlı and Tamamlayanlar, where the
 * course team marks a course complete or takes a talebe out of it; and
 * Erişimi kaldırılanlar, the record of who was taken out and why. The counts
 * are the lists' own, so a decision moves the numbers with the rows. An
 * application is decided with the Pano's actions and in its words; the API
 * takes no reason for a rejection, so "Reddet" asks once before it acts.
 * `can` says which of the three decisions the caller holds in this course
 * (`enrollment.decide`, `enrollment.complete`, `enrollment.remove`); a button
 * for one they do not hold is not drawn, and the API still decides every
 * write. `removed` is null when that list could not be read.
 */
export function EnrolmentsTabs({
  courseId,
  courseName,
  requiresApproval,
  can,
  lists,
  removed,
}: {
  courseId: string;
  courseName: string;
  /** null when the course could not be read */
  requiresApproval: boolean | null;
  can: RosterPermissions;
  lists: Lists;
  removed: RemovedRow[] | null;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("applications");
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<{ id: string; action: Decision } | null>(
    null
  );
  const [rejecting, setRejecting] = useState<ApplicationRow | null>(null);

  const waiting = lists.applications.filter((row) => !decided.has(row.userId));

  const decide = (row: ApplicationRow, action: Decision) => {
    setBusy({ id: row.userId, action });
    startTransition(async () => {
      const result = await (action === "approve"
        ? approveApplication
        : rejectApplication)(courseId, row.userId);
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
            { name: row.name, course: courseName }
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
        setDecided((current) => new Set(current).add(row.userId));
        router.refresh();
      }
      setBusy(null);
    });
  };

  const applicationColumns: TableColumn<ApplicationRow>[] = [
    {
      key: "student",
      header: t("CourseStudents.columns.student"),
      rowHeader: true,
      width: "30%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <Avatar name={row.name} decorative />
          <bdi className="font-semibold">{row.name}</bdi>
        </span>
      ),
    },
    {
      key: "email",
      header: t("CourseStudents.columns.email"),
      width: "30%",
      render: (row) =>
        row.email ? (
          <bdi dir="ltr" className="break-all font-mono">
            {row.email}
          </bdi>
        ) : (
          t("Nazirs.noValue")
        ),
    },
    {
      key: "at",
      header: t("CourseStudents.columns.applied"),
      width: "20%",
      render: (row) => (
        <time className="whitespace-nowrap" dateTime={row.at.iso}>
          {row.at.label}
        </time>
      ),
    },
  ];
  const decideColumn: TableColumn<ApplicationRow> = {
    key: "actions",
    header: (
      <span className="mds-visually-hidden">
        {t("CourseStudents.columns.actions")}
      </span>
    ),
    align: "right",
    width: "20%",
    render: (row) => {
      const mine = busy?.id === row.userId ? busy.action : null;
      return (
        <span className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="small"
            iconLeft={<Icon name="check" size="sm" />}
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
  };
  const columns = can.decide
    ? [...applicationColumns, decideColumn]
    : applicationColumns;

  return (
    <>
      <Tabs
        label={t("CourseStudents.tabsLabel")}
        value={tab}
        onChange={(next) => setTab(next as Tab)}
        tabs={[
          {
            value: "applications",
            label: t("CourseStudents.tabs.applications"),
            count: waiting.length,
          },
          {
            value: "enrolled",
            label: t("CourseStudents.tabs.enrolled"),
            count: lists.enrolled.length,
          },
          {
            value: "completed",
            label: t("CourseStudents.tabs.completed"),
            count: lists.completed.length,
          },
          {
            value: "removed",
            label: t("CourseStudents.tabs.removed"),
            ...(removed ? { count: removed.length } : {}),
          },
        ]}
      >
        <TabsPanel value="applications" className="flex flex-col gap-4 pbs-4">
          {requiresApproval === null ? null : (
            <p>
              {t(
                requiresApproval
                  ? "CourseStudents.applicationsNote"
                  : "CourseStudents.applicationsNoteOpen"
              )}
            </p>
          )}
          <Table
            caption={t("CourseStudents.captions.applications")}
            columns={columns}
            rows={waiting}
            rowKey={(row) => row.userId}
            empty={t("CourseStudents.empty.applications")}
            sort={{ key: "at", direction: "descending" }}
            responsive="stack"
          />
        </TabsPanel>
        <TabsPanel value="enrolled" className="pbs-4">
          <RosterTable
            variant="enrolled"
            courseId={courseId}
            courseName={courseName}
            can={can}
            rows={lists.enrolled}
          />
        </TabsPanel>
        <TabsPanel value="completed" className="pbs-4">
          <RosterTable
            variant="completed"
            courseId={courseId}
            courseName={courseName}
            can={can}
            rows={lists.completed}
          />
        </TabsPanel>
        <TabsPanel value="removed" className="pbs-4">
          <RemovedTable rows={removed} />
        </TabsPanel>
      </Tabs>
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
              course: courseName,
            })}
          </p>
        </AlertDialog>
      ) : null}
    </>
  );
}
