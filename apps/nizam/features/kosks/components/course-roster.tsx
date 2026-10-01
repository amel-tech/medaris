"use client";

import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  SealCheckIcon,
  UserMinusIcon,
  XIcon,
} from "@medaris/icons";
import {
  type EnrollmentResponse,
  TeamSettableEnrollmentStatus,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/components/badge";
import { Button } from "@medaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@medaris/ui/components/dialog";
import { toast } from "@medaris/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@medaris/ui/components/table";
import { Textarea } from "@medaris/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useId, useState, useTransition } from "react";
import {
  approveEnrollment,
  rejectEnrollment,
  removeEnrollment,
  setEnrollmentStatus,
} from "~/features/kosks/actions/courses";
import {
  courseTeamErrorKey,
  type RosterAction,
  rosterActions,
} from "~/features/kosks/course-team";

const REASON_MAX = 500;

type Result =
  | { success: true }
  | { success: false; error: string; errorBody?: unknown };

/**
 * A course's enrollments for its team (MDRS-105): the köşk manager and the
 * course's müderrisler approve or reject requests, complete or reopen a
 * course for a talebe, and take a talebe out with a reason. tedrisat decides
 * who may; this page is only reached through the course editor.
 */
export const CourseRoster = ({
  koskId,
  courseId,
  enrollments,
}: {
  koskId: string;
  courseId: string;
  enrollments: EnrollmentResponse[];
}) => {
  const t = useTranslations("nizam");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acting, setActing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EnrollmentResponse | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const reasonId = useId();

  const nameOf = (e: EnrollmentResponse) =>
    e.studentName || t("CourseTeam.unnamed", { id: e.userId.slice(0, 8) });

  const run = (
    e: EnrollmentResponse,
    action: () => Promise<Result>,
    success: string,
    after?: () => void
  ) => {
    setActing(e.userId);
    startTransition(async () => {
      const res = await action();
      setActing(null);
      if (res.success === false) {
        const key = courseTeamErrorKey(res.errorBody);
        toast.error(key ? t(key) : res.error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });
  };

  const act = (e: EnrollmentResponse, action: RosterAction) => {
    switch (action) {
      case "approve":
        return run(
          e,
          () => approveEnrollment(koskId, courseId, e.userId),
          t("CourseTeam.approved")
        );
      case "reject":
        return run(
          e,
          () => rejectEnrollment(koskId, courseId, e.userId),
          t("CourseTeam.rejected")
        );
      case "complete":
        return run(
          e,
          () =>
            setEnrollmentStatus(
              koskId,
              courseId,
              e.userId,
              TeamSettableEnrollmentStatus.Completed
            ),
          t("CourseTeam.completed")
        );
      case "reopen":
        return run(
          e,
          () =>
            setEnrollmentStatus(
              koskId,
              courseId,
              e.userId,
              TeamSettableEnrollmentStatus.Enrolled
            ),
          t("CourseTeam.reopened")
        );
      case "remove":
        setReason("");
        setReasonError(false);
        setRemoving(e);
        return;
    }
  };

  const confirmRemove = () => {
    if (!removing) return;
    const text = reason.trim();
    if (!text) {
      setReasonError(true);
      return;
    }
    run(
      removing,
      () => removeEnrollment(koskId, courseId, removing.userId, text),
      t("CourseTeam.removed"),
      () => setRemoving(null)
    );
  };

  const statusBadge = (status: EnrollmentResponse["status"]) => {
    if (status === "PENDING") {
      return <Badge variant="outline">{t("CourseTeam.statusPending")}</Badge>;
    }
    if (status === "COMPLETED") {
      return <Badge>{t("CourseTeam.statusCompleted")}</Badge>;
    }
    return <Badge variant="secondary">{t("CourseTeam.statusEnrolled")}</Badge>;
  };

  const ACTION_UI: Record<
    RosterAction,
    { label: string; icon: ReactNode; destructive?: boolean }
  > = {
    approve: { label: t("CourseTeam.approve"), icon: <CheckIcon size={14} /> },
    reject: { label: t("CourseTeam.reject"), icon: <XIcon size={14} /> },
    complete: {
      label: t("CourseTeam.complete"),
      icon: <SealCheckIcon size={14} />,
    },
    reopen: {
      label: t("CourseTeam.reopen"),
      icon: <ArrowCounterClockwiseIcon size={14} />,
    },
    remove: {
      label: t("CourseTeam.remove"),
      icon: <UserMinusIcon size={14} />,
      destructive: true,
    },
  };

  if (enrollments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {t("CourseTeam.empty")}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("CourseTeam.colName")}</TableHead>
              <TableHead>{t("CourseTeam.colStatus")}</TableHead>
              <TableHead>{t("CourseTeam.colProgress")}</TableHead>
              <TableHead>{t("CourseTeam.colJoined")}</TableHead>
              <TableHead className="text-right">
                {t("CourseTeam.colActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrollments.map((e) => {
              const busy = pending && acting === e.userId;
              return (
                <TableRow key={e.userId}>
                  <TableCell>
                    <div className="font-medium">{nameOf(e)}</div>
                    {e.studentEmail && (
                      <div className="text-xs text-muted-foreground">
                        {e.studentEmail}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(e.status)}</TableCell>
                  <TableCell>%{e.progress}</TableCell>
                  <TableCell>
                    {format.dateTime(new Date(e.createdAt), {
                      dateStyle: "medium",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      {rosterActions(e.status).map((action) => {
                        const ui = ACTION_UI[action];
                        return (
                          <Button
                            key={action}
                            size="sm"
                            variant={ui.destructive ? "outline" : "ghost"}
                            disabled={busy}
                            onClick={() => act(e, action)}
                            className={
                              ui.destructive
                                ? "gap-1.5 text-destructive"
                                : "gap-1.5"
                            }
                          >
                            {ui.icon}
                            {ui.label}
                          </Button>
                        );
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {removing &&
                t("CourseTeam.removeTitle", { name: nameOf(removing) })}
            </DialogTitle>
            <DialogDescription>
              {t("CourseTeam.removeDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium">
              {t("CourseTeam.reasonLabel")}
            </label>
            <Textarea
              id={reasonId}
              rows={4}
              maxLength={REASON_MAX}
              value={reason}
              aria-invalid={reasonError || undefined}
              aria-describedby={`${reasonId}-help`}
              onChange={(ev) => {
                setReason(ev.target.value);
                if (reasonError) setReasonError(false);
              }}
            />
            <p
              id={`${reasonId}-help`}
              role={reasonError ? "alert" : undefined}
              className={
                reasonError
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {reasonError
                ? t("CourseTeam.reasonRequired")
                : t("CourseTeam.reasonHelp")}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setRemoving(null)}
            >
              {t("CourseTeam.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={confirmRemove}
            >
              {t("CourseTeam.confirmRemove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
