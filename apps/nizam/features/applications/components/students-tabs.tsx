"use client";

import type {
  RemovedEnrollmentResponse,
  RosterEnrollmentResponse,
} from "@medaris/services/tedrisat";
import type { TableSort } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  type ApplicationRow,
  type Messages,
  rowKey,
  sortByDate,
} from "../present";
import { useDecisions } from "../use-decisions";
import { ApplicationsTable } from "./applications-table";
import { RemovedTable } from "./removed-table";
import { RosterTable } from "./roster-table";

type Tab = "applications" | "enrolled" | "completed" | "removed";

/**
 * The tabs of a course's Talebeler page (nizam 57): Başvurular first, where the
 * waiting applications are decided; Kayıtlı and Tamamlayanlar keep the roster
 * of MDRS-105 and its ban windows (MDRS-177) as nizam 58 draws them, and
 * Erişimi kaldırılanlar lists who the course team took out and why (MDRS-178).
 * Counts come from the lists, so a decision moves the numbers with the rows.
 */
export function StudentsTabs({
  koskId,
  koskName,
  courseId,
  courseTitle,
  requiresApproval,
  applications,
  roster,
  removed,
  mayBanKosk,
  nextSessionAt,
}: {
  koskId: string;
  koskName: string;
  courseId: string;
  courseTitle: string;
  requiresApproval: boolean;
  applications: ApplicationRow[];
  /** enrolled and completed talebe: the roster without the waiting ones */
  roster: RosterEnrollmentResponse[];
  /** the talebe the team took out, newest first */
  removed: RemovedEnrollmentResponse[];
  mayBanKosk: boolean;
  nextSessionAt: string | null;
}) {
  const t = useTranslations("nizam.StudentsPage") as unknown as Messages;
  const [tab, setTab] = useState<Tab>("applications");
  const [sort, setSort] = useState<TableSort>({
    key: "date",
    direction: "descending",
  });
  const { busy, decided, decide } = useDecisions(koskId);

  const waiting = useMemo(
    () =>
      sortByDate(
        applications.filter((row) => !decided.has(rowKey(row))),
        sort.direction
      ),
    [applications, decided, sort.direction]
  );
  const enrolled = roster.filter((e) => e.status === "ENROLLED");
  const completed = roster.filter((e) => e.status === "COMPLETED");

  const rosterTable = (
    variant: "enrolled" | "completed",
    list: RosterEnrollmentResponse[],
    empty: string
  ) => (
    <RosterTable
      variant={variant}
      koskId={koskId}
      koskName={koskName}
      courseId={courseId}
      courseTitle={courseTitle}
      list={list}
      mayBanKosk={mayBanKosk}
      nextSessionAt={nextSessionAt}
      empty={empty}
    />
  );

  return (
    <Tabs
      label={t("tabsLabel")}
      value={tab}
      onChange={(next) => setTab(next as Tab)}
      tabs={[
        {
          value: "applications",
          label: t("tabs.applications"),
          count: waiting.length,
        },
        {
          value: "enrolled",
          label: t("tabs.enrolled"),
          count: enrolled.length,
        },
        {
          value: "completed",
          label: t("tabs.completed"),
          count: completed.length,
        },
        {
          value: "removed",
          label: t("tabs.removed"),
          count: removed.length,
        },
      ]}
    >
      <TabsPanel value="applications" className="flex flex-col gap-4 pbs-4">
        <p>
          {requiresApproval ? t("applicationsNote") : t("applicationsNoteOpen")}
        </p>
        <ApplicationsTable
          variant="course"
          rows={waiting}
          caption={t("caption", { course: courseTitle })}
          empty={t("emptyApplications")}
          busyKey={busy}
          sort={sort}
          onSortChange={setSort}
          onDecide={decide}
        />
      </TabsPanel>
      <TabsPanel value="enrolled" className="pbs-4">
        {rosterTable("enrolled", enrolled, t("emptyEnrolled"))}
      </TabsPanel>
      <TabsPanel value="completed" className="pbs-4">
        {rosterTable("completed", completed, t("emptyCompleted"))}
      </TabsPanel>
      <TabsPanel value="removed" className="pbs-4">
        <RemovedTable list={removed} courseTitle={courseTitle} />
      </TabsPanel>
    </Tabs>
  );
}
