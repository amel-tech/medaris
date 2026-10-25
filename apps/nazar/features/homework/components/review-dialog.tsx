"use client";

import type { CourseSubmissionResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { FileLink } from "../../files/components/file-link";
import { FileUpload } from "../../files/components/file-upload";
import { fileErrorKey, fileRoutes } from "../../files/files";
import { deleteSubmissionReviewFile, sendSubmissionReview } from "../actions";
import {
  changedLabel,
  type HomeworkRow,
  REVIEW_NOTE_MAX,
  reviewStatus,
  rowOf,
} from "../homework";

const BADGES = {
  none: { variant: "outline", key: "Homework.review.statusNone" },
  draft: { variant: "outline", key: "Homework.review.statusDraft" },
  sent: { variant: "success", key: "Homework.review.statusSent" },
  changedSince: { variant: "warning", key: "Homework.review.statusChanged" },
} as const;

/**
 * The "Değerlendirme" cell of an Ödevler row: where the homework stands with
 * the course team, who last sent the review and when, and "Değerlendir",
 * which opens the review: a note to the talebe and up to five files returned
 * (the talebe's work corrected, or anything else). Files are stored as they
 * are chosen; the talebe sees the review only once "Değerlendirmeyi gönder"
 * sends it, and is told. Sending again replaces the note.
 */
export function ReviewCell({
  courseId,
  sessionTitle,
  row,
  onChange,
  locale,
  courseTimeZone,
}: {
  courseId: string;
  sessionTitle: string;
  row: HomeworkRow;
  /** told the homework as tedrisat answers it after each change */
  onChange: (next: HomeworkRow) => void;
  locale: string;
  courseTimeZone: string;
}) {
  const t = useTranslations("nazar");
  const [open, setOpen] = useState(false);
  const status = reviewStatus(row);
  const badge = BADGES[status];
  const name = row.talebe ?? t("Homework.unknownTalebe");

  return (
    <span
      className="flex flex-col items-start gap-1"
      data-testid={`review-${row.id}`}
    >
      <Badge variant={badge.variant}>{t(badge.key)}</Badge>
      {row.review?.reviewedAt ? (
        <span className="mds-caption">
          {t("Homework.review.sentBy", {
            name: row.review.reviewer ?? t("Homework.unknownTalebe"),
            when: changedLabel(
              new Date(row.review.reviewedAt),
              locale,
              courseTimeZone
            ),
          })}
        </span>
      ) : null}
      <Button
        variant={status === "sent" ? "ghost" : "outline"}
        size="small"
        type="button"
        iconLeft={<Icon name="edit" size="sm" />}
        aria-label={t("Homework.review.openFor", { name })}
        onClick={() => setOpen(true)}
      >
        {t(
          status === "none" || status === "draft"
            ? "Homework.review.open"
            : "Homework.review.edit"
        )}
      </Button>
      {open ? (
        <ReviewDialog
          courseId={courseId}
          sessionTitle={sessionTitle}
          row={row}
          onChange={onChange}
          onClose={() => setOpen(false)}
          locale={locale}
        />
      ) : null}
    </span>
  );
}

function ReviewDialog({
  courseId,
  sessionTitle,
  row,
  onChange,
  onClose,
  locale,
}: {
  courseId: string;
  sessionTitle: string;
  row: HomeworkRow;
  onChange: (next: HomeworkRow) => void;
  onClose: () => void;
  locale: string;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [note, setNote] = useState(row.review?.note ?? "");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [pending, startTransition] = useTransition();
  const files = row.review?.files ?? [];
  const sent = Boolean(row.review?.reviewedAt);
  const tooLong = note.trim().length > REVIEW_NOTE_MAX;
  const busy = pending || uploading || removing !== null;
  const name = row.talebe ?? t("Homework.unknownTalebe");

  const fail = (code: string) =>
    notify({
      tone: "error",
      title: t("Homework.review.failed"),
      description:
        code === "SUBMISSION_REVIEW_EMPTY"
          ? t("Homework.review.empty")
          : code === "SUBMISSION_REVIEW_FILE_LIMIT"
            ? t("Homework.review.fileLimit")
            : words(fileErrorKey(code)),
    });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || tooLong) return;
    const body = note.trim() || null;
    if (!body && files.length === 0) {
      setEmpty(true);
      return;
    }
    startTransition(async () => {
      const result = await sendSubmissionReview(courseId, row.id, body);
      if (handleUnauthenticated(result)) return;
      if (!result.success) {
        fail(result.code);
        return;
      }
      onChange(rowOf(result.data));
      notify({
        title: t("Homework.review.sent"),
        description: t("Homework.review.sentBody", { name }),
      });
      onClose();
    });
  };

  const remove = async (fileId: string) => {
    setRemoving(fileId);
    try {
      const result = await deleteSubmissionReviewFile(courseId, row.id, fileId);
      if (handleUnauthenticated(result)) return;
      if (!result.success && result.code !== "SUBMISSION_FILE_NOT_FOUND") {
        fail(result.code);
        return;
      }
      if (row.review) {
        onChange({
          ...row,
          review: {
            ...row.review,
            files: row.review.files.filter((file) => file.id !== fileId),
          },
        });
      }
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={sessionTitle}
      title={t("Homework.review.title", { name })}
      closeLabel={t("Shell.close")}
      footerMeta={t(
        sent ? "Homework.review.sentNote" : "Homework.review.notSentNote"
      )}
      footer={
        <>
          <DialogClose>{t("Homework.review.close")}</DialogClose>
          <Button type="submit" loading={pending} disabled={busy || tooLong}>
            {t(sent ? "Homework.review.resend" : "Homework.review.send")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="review-dialog">
        <section className="flex flex-col gap-2">
          <h3 className="mds-label">{t("Homework.review.handedIn")}</h3>
          {row.files.length === 0 ? (
            <p className="mds-body-sm text-neutral-muted">
              {t("Homework.noFiles")}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {row.files.map((file) => (
                <li key={file.id}>
                  <FileLink
                    file={file}
                    href={fileRoutes.submissionFile(courseId, file.id)}
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          )}
          {row.note?.trim() ? (
            <p
              className="mds-body-sm whitespace-pre-line break-words"
              dir="auto"
            >
              {row.note.trim()}
            </p>
          ) : null}
        </section>

        <Field
          label={t("Homework.review.noteLabel")}
          help={t("Homework.review.noteHelp")}
          error={
            tooLong
              ? t("Homework.review.tooLong", { max: REVIEW_NOTE_MAX })
              : empty
                ? t("Homework.review.empty")
                : undefined
          }
        >
          <Textarea
            name="review-note"
            rows={5}
            dir="auto"
            maxLength={REVIEW_NOTE_MAX}
            value={note}
            disabled={pending}
            onChange={(event) => {
              setNote(event.target.value);
              setEmpty(false);
            }}
          />
        </Field>

        <section className="flex flex-col gap-2">
          <h3 className="mds-label">{t("Homework.review.filesTitle")}</h3>
          {files.length === 0 ? (
            <p className="mds-body-sm">{t("Homework.review.filesEmpty")}</p>
          ) : (
            <ul
              className="m-0 flex list-none flex-col p-0"
              data-testid="review-files"
            >
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 border-be border-neutral-subtle last:border-be-0"
                >
                  <FileLink
                    file={file}
                    href={fileRoutes.submissionReviewFile(courseId, file.id)}
                    locale={locale}
                  />
                  <IconButton
                    size="small"
                    icon={<Icon name="trash" size="sm" />}
                    label={t("Homework.review.fileRemove", {
                      name: file.name,
                    })}
                    disabled={busy}
                    onClick={() => void remove(file.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          <FileUpload
            prefix={`review-${row.id}`}
            kind="review"
            control={{
              route: fileRoutes.submissionReview(courseId, row.id),
              blocked: pending || removing !== null,
              onBusyChange: setUploading,
              onUploaded: (data: CourseSubmissionResponse) => {
                setEmpty(false);
                onChange(rowOf(data));
              },
            }}
            disabled={pending}
            locale={locale}
          />
        </section>
      </div>
    </Dialog>
  );
}
