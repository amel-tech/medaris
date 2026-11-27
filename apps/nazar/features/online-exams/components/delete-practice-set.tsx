"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { deletePracticeSet } from "../actions";
import { onlineExamErrorKey } from "../online-exams";

/** A refusal of "Seti sil", in words: a set a talebe started, one gone meanwhile, any other. */
export const deleteErrorKey = (code: string): string =>
  code === "EXAM_LOCKED"
    ? "Practice.deleteLocked"
    : code === "EXAM_NOT_FOUND"
      ? "Practice.deleteGone"
      : onlineExamErrorKey(code);

/**
 * "Sil" of a çalışma seti (MDRS-248), in a row of "Çalışma Soruları" or as
 * "Seti sil" on the set's page. It asks first, naming the set and that its
 * questions go with it; then the set is deleted, a short note says so and
 * the list is drawn again (`row`) or opened (`page`). A set a talebe has
 * started, or a pool attempt drew from, is locked: the button stays, off,
 * with the reason written beside it, since the API refuses it (EXAM_LOCKED).
 */
export function DeletePracticeSet({
  courseId,
  setId,
  title,
  locked,
  placement,
}: {
  courseId: string;
  setId: string;
  title: string;
  locked: boolean;
  placement: "row" | "page";
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const reasonId = `delete-reason-${useId().replace(/[^\w-]/g, "")}`;

  const remove = async () => {
    setAsking(false);
    setSending(true);
    try {
      const result = await deletePracticeSet(setId);
      if (handleUnauthenticated(result)) return;
      if (!result.success) {
        notify({
          id: "practice-set-delete",
          tone: "error",
          title: t("Practice.deleteFailed"),
          description: words(deleteErrorKey(result.code)),
        });
        // Locked or gone meanwhile: the page shows it as it now stands.
        if (result.code === "EXAM_LOCKED" || result.code === "EXAM_NOT_FOUND")
          router.refresh();
        return;
      }
      notify({
        id: "practice-set-delete",
        tone: "success",
        title: t("Practice.deleted", { title }),
      });
      if (placement === "page") {
        router.push(`/ders/${courseId}/calisma-sorulari`);
      } else {
        router.refresh();
      }
    } catch {
      notify({
        id: "practice-set-delete",
        tone: "error",
        title: t("Practice.deleteFailed"),
      });
    } finally {
      setSending(false);
    }
  };

  const row = placement === "row";
  const button = (
    <Button
      variant={row ? "outline" : "destructive"}
      size={row ? "small" : "regular"}
      iconLeft={<Icon name="trash" size="sm" />}
      disabled={locked}
      loading={sending}
      aria-label={row ? t("Practice.deleteLabel", { title }) : undefined}
      aria-describedby={locked ? reasonId : undefined}
      onClick={() => setAsking(true)}
    >
      {row ? t("Practice.delete") : t("Practice.deleteSet")}
    </Button>
  );
  const reason = locked ? (
    <span id={reasonId} className="mds-body-sm text-neutral-muted">
      {row ? t("Practice.deleteLockedShort") : t("Practice.deleteLocked")}
    </span>
  ) : null;
  const dialog = (
    <AlertDialog
      open={asking}
      onOpenChange={setAsking}
      title={t("Practice.deleteTitle", { title })}
      confirmLabel={t("Practice.deleteSet")}
      cancelLabel={t("OnlineExams.cancel")}
      closeLabel={t("Shell.close")}
      confirmVariant="destructive"
      onConfirm={remove}
    >
      {t("Practice.deleteBody")}
    </AlertDialog>
  );

  if (row) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        {reason}
        {button}
        {dialog}
      </span>
    );
  }
  return (
    <section
      className="mds-card flex flex-col gap-3 p-4"
      aria-labelledby="delete-set-title"
    >
      <h2 id="delete-set-title" className="mds-h2">
        {t("Practice.deleteSet")}
      </h2>
      <p className="mds-body-sm text-neutral-muted">
        {locked ? reason : t("Practice.deleteHelp")}
      </p>
      <div>{button}</div>
      {dialog}
    </section>
  );
}
