"use client";

import type { HostingRightResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { revokeHostingRight } from "../actions";
import {
  type CoursesChoice,
  canRevoke,
  courseLine,
  coursesActionFor,
  hostingErrorKey,
  type Messages,
  studentTotal,
} from "../present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  koskName: string;
  right: HostingRightResponse | null;
  /** called once the right is withdrawn */
  onRevoked?: () => void;
}

/**
 * "Barındırma hakkını geri al" (nizam 27): a Dialog with a Form. It names the
 * medrese and its köşk, lists the open courses the withdrawal does not close,
 * and asks what becomes of them — they carry on, or are hidden (and come back
 * from the Arşiv). No answer is chosen for the person, so the button stays off
 * until there is one; "Vazgeç" has the focus. With no open course there is
 * nothing to ask and the question is left out. The scrim does not close it.
 */
export function RevokeDialog({
  open,
  onOpenChange,
  koskId,
  koskName,
  right,
  onRevoked,
}: Props) {
  const tm = useTranslations("nizam.RevokeDialog");
  const t = tm as unknown as Messages;
  const tp = useTranslations("nizam.HostingPage");
  const [choice, setChoice] = useState<CoursesChoice>(null);
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // A new withdrawal starts with no answer.
  useEffect(() => {
    if (open) setChoice(null);
  }, [open]);

  const courses = right?.openCourses ?? [];
  const count = courses.length;
  const students = studentTotal(courses);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = coursesActionFor(count, choice);
    if (!right || !action) return;
    setSaving(true);
    const result = await revokeHostingRight(koskId, right.madrasahId, action);
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(hostingErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("revoked"), {
      description: t("revokedBody", { name: right.name, kosk: koskName }),
    });
    onRevoked?.();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={right?.name}
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={cancelRef}
      footerMeta={t("auditNote")}
      footer={
        <>
          <DialogClose ref={cancelRef}>{t("cancel")}</DialogClose>
          <Button
            type="submit"
            loading={saving}
            disabled={!canRevoke(count, choice)}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>
        {tm.rich("intro", {
          name: right?.name ?? "",
          count,
          b: (chunks) => <b>{chunks}</b>,
        })}
      </p>
      {count > 0 ? (
        <>
          <ul
            className="mds-card flex flex-col divide-y divide-[var(--border-neutral-default)] p-0"
            data-testid="open-courses"
          >
            {courses.map((course) => (
              <li
                key={course.id}
                className="flex items-center justify-between gap-3 p-card"
              >
                <span className="flex min-w-0 flex-col">
                  <bdi className="font-semibold">{course.title}</bdi>
                  <bdi className="mds-caption">{courseLine(course, t)}</bdi>
                </span>
                <Badge
                  variant={
                    course.status === "PUBLISHED" ? "secondary" : "outline"
                  }
                >
                  {t(`courseStatus.${course.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
          <RadioGroup
            legend={t("coursesLegend")}
            value={choice}
            onChange={(v) => setChoice(v === "HIDE" ? "HIDE" : "KEEP")}
            bordered
            required
            disabled={saving}
            options={[
              {
                value: "KEEP",
                label: t("keep"),
                description: t("keepDesc", { count }),
              },
              {
                value: "HIDE",
                label: t("hide"),
                description: t("hideDesc", { count, students }),
              },
            ]}
          />
        </>
      ) : (
        <p className="mds-caption">{t("noOpenCourses")}</p>
      )}
    </Dialog>
  );
}
