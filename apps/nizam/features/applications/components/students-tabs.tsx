"use client";

import type { RosterEnrollmentResponse } from "@medaris/services/tedrisat";
import type { TableSort } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CourseRoster } from "~/features/kosks/components/course-roster";
import {
  type ApplicationRow,
  type Messages,
  rowKey,
  sortByDate,
} from "../present";
import { useDecisions } from "../use-decisions";
import { ApplicationsTable } from "./applications-table";

type Tab = "applications" | "enrolled" | "completed";

/**
 * The tabs of a course's Talebeler page (nizam 57): Başvurular first, where the
 * waiting applications are decided; Kayıtlı and Tamamlayanlar keep the roster
 * of MDRS-105 and its ban windows (MDRS-177). Counts come from the lists, so a
 * decision moves the numbers with the rows. "Erişimi kaldırılanlar" is not
 * drawn: tedrisat keeps no record of who was taken out to list.
 */
export function StudentsTabs({
  koskId,
  koskName,
  courseId,
  courseTitle,
  requiresApproval,
  applications,
  roster,
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

  const roster_ = (list: RosterEnrollmentResponse[], empty: string) =>
    list.length === 0 ? (
      <p className="mds-caption">{empty}</p>
    ) : (
      <CourseRoster
        koskId={koskId}
        koskName={koskName}
        courseId={courseId}
        courseTitle={courseTitle}
        enrollments={list}
        mayBanKosk={mayBanKosk}
        nextSessionAt={nextSessionAt}
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
        {roster_(enrolled, t("emptyEnrolled"))}
      </TabsPanel>
      <TabsPanel value="completed" className="pbs-4">
        {roster_(completed, t("emptyCompleted"))}
      </TabsPanel>
    </Tabs>
  );
}
