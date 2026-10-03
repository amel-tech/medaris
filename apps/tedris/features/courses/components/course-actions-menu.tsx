"use client";

import { toast } from "@medaris/ui/components/sonner";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Icon } from "@medaris/ui/mds/icon";
import { Menu } from "@medaris/ui/mds/menu";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { leaveCourse } from "../actions";

export interface CourseActionsLabels {
  /** the trigger's name: "Diğer işlemler", or with the course's title in a list */
  trigger: string;
  leave: string;
  title: string;
  confirm: string;
  cancel: string;
  /** "<b>{title}</b> dersinden ayrılacaksın. …" */
  body: ReactNode;
  bodyCards: string;
  left: string;
  /** a 404 or 409: the enrollment is gone or settled elsewhere */
  conflict: string;
  failed: string;
}

/**
 * The "···" of an enrolled course (design tedris/12 and tedris/20): a menu
 * with "Dersten ayrıl", which asks first, because leaving also deletes the
 * talebe's progress (MDRS-105). The words come from the caller, so a server
 * page (Derslerim) and a client card (the course page) both draw it.
 */
export function CourseActionsMenu({
  courseId,
  courseTitle,
  labels,
  size = "small",
}: {
  courseId: string;
  courseTitle: string;
  labels: CourseActionsLabels;
  size?: "mini" | "small";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const leave = () =>
    startTransition(async () => {
      const res = await leaveCourse(courseId);
      setOpen(false);
      if (res.success === false) {
        const stale = res.status === 404 || res.status === 409;
        toast.error(stale ? labels.conflict : labels.failed);
        // A stale page: draw what the enrollment is now.
        if (stale) router.refresh();
        return;
      }
      toast.success(labels.left);
      router.refresh();
    });

  return (
    <>
      <Menu
        label={labels.trigger}
        icon={<Icon name="more" />}
        size={size}
        items={[
          {
            value: "leave",
            label: labels.leave,
            onSelect: () => setOpen(true),
          },
        ]}
      />
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        eyebrow={courseTitle}
        title={labels.title}
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        confirmLoading={pending}
        onConfirm={leave}
      >
        <p>{labels.body}</p>
        <p>{labels.bodyCards}</p>
      </AlertDialog>
    </>
  );
}
