"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@medaris/ui/components/alert-dialog";
import { toast } from "@medaris/ui/components/sonner";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { leaveCourse } from "../actions";

/** The withdraw button's id: the application window hands focus to it (design tedris/07). */
export const WITHDRAW_BUTTON_ID = "withdraw-request";

/**
 * The talebe's own way out of a course (MDRS-105): withdraw a request that
 * is still awaiting approval, or leave a course they are enrolled in. Both
 * delete the enrollment, and either way they may apply again. Leaving asks
 * first, because it also deletes their progress; withdrawing a request does
 * not, because there is nothing to lose.
 */
export const LeaveCourse = ({
  courseId,
  mode,
}: {
  courseId: string;
  mode: "withdraw" | "leave";
}) => {
  const t = useTranslations("tedris");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const leave = () =>
    startTransition(async () => {
      const res = await leaveCourse(courseId);
      if (res.success === false) {
        toast.error(res.error);
        return;
      }
      toast.success(
        mode === "withdraw" ? t("CoursePage.withdrawn") : t("CoursePage.left")
      );
      router.refresh();
    });

  const linkClass =
    "mt-2 w-full text-center text-[13px] font-medium text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60";

  if (mode === "withdraw") {
    return (
      <button
        id={WITHDRAW_BUTTON_ID}
        type="button"
        onClick={leave}
        disabled={pending}
        className={linkClass}
      >
        {t("CoursePage.withdrawRequest")}
      </button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" disabled={pending} className={linkClass}>
          {t("CoursePage.leaveCourse")}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("CoursePage.leaveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("CoursePage.leaveDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("CoursePage.leaveCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={leave}>
            {t("CoursePage.leaveConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
