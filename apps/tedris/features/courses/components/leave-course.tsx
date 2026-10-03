"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { courseActionErrorKey } from "../action-error";
import { withdrawEnrollment } from "../actions";

/** The withdraw button's id: the application window hands focus to it (design tedris/07). */
export const WITHDRAW_BUTTON_ID = "withdraw-request";

/**
 * Withdraw a request that is still awaiting approval (MDRS-105). It deletes the
 * enrollment, and the talebe may apply again; it does not ask first, because
 * there is nothing to lose. Leaving an enrolled course is the "···" menu's
 * "Dersten ayrıl" (`CourseActionsMenu`), which does ask.
 */
export const LeaveCourse = ({ courseId }: { courseId: string }) => {
  const t = useTranslations("tedris");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const leave = () =>
    startTransition(async () => {
      const res = await withdrawEnrollment(courseId);
      if (res.success === false) {
        // The page was drawn, so the course exists: a 404 here means the
        // enrollment is gone or settled elsewhere (an application approved in
        // the meantime), not that the course vanished.
        toast.error(
          t(
            `CoursePage.${res.status === 404 ? "actionConflict" : courseActionErrorKey(res.status)}`
          )
        );
        // A stale page: draw what the enrollment is now.
        if (res.status === 404 || res.status === 409) router.refresh();
        return;
      }
      toast.success(t("CoursePage.withdrawn"));
      router.refresh();
    });

  return (
    <Button
      id={WITHDRAW_BUTTON_ID}
      variant="secondary"
      fullWidth
      className="mbs-3"
      onClick={leave}
      loading={pending}
      loadingLabel={t("CoursePage.withdrawing")}
    >
      {t("CoursePage.withdrawRequest")}
    </Button>
  );
};
