import type { ReactNode } from "react";
import type { LooseTranslator } from "~/lib/i18n/loose";
import type { CourseActionsLabels } from "./components/course-actions-menu";

type RichTranslator = LooseTranslator & {
  rich: (key: string, values: Record<string, unknown>) => ReactNode | string;
};

/** The words of the "···" menu and its leave window, from the `tedris` namespace. */
export const courseActionsLabels = (
  t: RichTranslator,
  courseTitle: string,
  { named = false }: { named?: boolean } = {}
): CourseActionsLabels => ({
  trigger: named
    ? t("CoursePage.moreActionsFor", { title: courseTitle })
    : t("CoursePage.moreActions"),
  leave: t("CoursePage.leaveCourse"),
  title: t("CoursePage.leaveTitle"),
  confirm: t("CoursePage.leaveConfirm"),
  cancel: t("CoursePage.leaveCancel"),
  body: t.rich("CoursePage.leaveBody", {
    title: courseTitle,
    b: (chunks: ReactNode) => (
      <strong>
        <bdi>{chunks}</bdi>
      </strong>
    ),
  }),
  bodyCards: t("CoursePage.leaveBodyCards"),
  left: t("CoursePage.left"),
  conflict: t("CoursePage.actionConflict"),
  failed: t("CoursePage.actionFailed"),
});
