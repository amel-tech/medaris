"use client";

import type { BulkEnrollmentResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { bulkEnroll } from "../actions";
import {
  BULK_MAX,
  bulkErrorKey,
  outcomeLines,
  parseEmailList,
  skipReasonKey,
  unmatched,
} from "../bulk";

/**
 * "Toplu talebe ekle" (owner, 2026-10-12): a form dialog with one textarea of
 * e-mail addresses, read as they are typed ("N adres"); more than 500 is
 * refused before anything is sent. The answer is shown in the same dialog: a
 * line per outcome with its count, the addresses no account was found for (and
 * the ones that are not addresses) in a box with "Kopyala", and the skipped
 * ones with their reason. Closing after an answer reads the roster again.
 */
export function BulkAddDialog({
  courseId,
  courseName,
  onClose,
  onDone,
}: {
  courseId: string;
  courseName: string;
  onClose: () => void;
  /** called when the dialog closes after an answer, for the page to read the roster again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [result, setResult] = useState<BulkEnrollmentResponse | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const unmatchedId = useId();

  const emails = parseEmailList(text);
  const tooMany = emails.length > BULK_MAX;

  const close = () => {
    if (pending) return;
    onClose();
    if (result) onDone();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || result || emails.length === 0 || tooMany) return;
    startTransition(async () => {
      const outcome = await bulkEnroll(courseId, emails);
      if (handleUnauthenticated(outcome)) return;
      if (outcome.success) {
        setResult(outcome.data);
        return;
      }
      notify({
        tone: "error",
        title: t("CourseStudents.bulk.failedTitle"),
        description: words(bulkErrorKey(outcome.code)),
      });
    });
  };

  const copy = async (list: string[]) => {
    try {
      await navigator.clipboard.writeText(list.join("\n"));
      notify({ tone: "success", title: t("CourseStudents.bulk.copied") });
    } catch {
      // No clipboard access (an insecure origin, a refused permission): the
      // box is left selected so the list can still be copied by hand.
      (
        document.getElementById(unmatchedId) as HTMLTextAreaElement | null
      )?.select();
      notify({ tone: "warning", title: t("CourseStudents.bulk.copyFailed") });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={courseName}
      title={t("CourseStudents.bulk.title")}
      closeLabel={t("Shell.close")}
      initialFocus={result ? undefined : listRef}
      footer={
        result ? (
          <DialogClose>{t("CourseStudents.bulk.close")}</DialogClose>
        ) : (
          <>
            <DialogClose>{t("CourseStudents.bulk.cancel")}</DialogClose>
            <Button
              type="submit"
              loading={pending}
              disabled={emails.length === 0 || tooMany}
            >
              {t("CourseStudents.bulk.submit")}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <BulkResult result={result} unmatchedId={unmatchedId} onCopy={copy} />
      ) : (
        <>
          <p>{t("CourseStudents.bulk.intro")}</p>
          <Field
            label={t("CourseStudents.bulk.label")}
            help={t("CourseStudents.bulk.help")}
            error={
              tooMany
                ? t("CourseStudents.bulk.tooMany", {
                    max: BULK_MAX,
                    count: emails.length,
                  })
                : undefined
            }
          >
            <Textarea
              {...({ ref: listRef } as object)}
              name="emails"
              dir="ltr"
              rows={8}
              value={text}
              disabled={pending}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <p
            className="mds-caption"
            aria-live="polite"
            data-testid="bulk-count"
          >
            {t("CourseStudents.bulk.count", { count: emails.length })}
          </p>
        </>
      )}
    </Dialog>
  );
}

/** The answer: a line per outcome, the addresses to copy, and the skipped ones with their reason. */
function BulkResult({
  result,
  unmatchedId,
  onCopy,
}: {
  result: BulkEnrollmentResponse;
  unmatchedId: string;
  onCopy: (list: string[]) => void;
}) {
  const t = useTranslations("nazar.CourseStudents.bulk");
  const words = t as unknown as Messages;
  const lines = outcomeLines(result);
  const list = unmatched(result);
  return (
    <>
      <ul className="flex flex-col gap-1" data-testid="bulk-outcomes">
        {lines.map(({ outcome, count }) => (
          <li key={outcome}>{t(`outcomes.${outcome}`, { count })}</li>
        ))}
      </ul>
      {list.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="bulk-unmatched">
          <Field label={t("unmatchedLabel")} help={t("unmatchedNote")}>
            <Textarea
              id={unmatchedId}
              dir="ltr"
              className="font-mono"
              readOnly
              rows={Math.min(Math.max(list.length, 2), 8)}
              value={list.join("\n")}
            />
          </Field>
          <span>
            <Button
              variant="secondary"
              size="small"
              iconLeft={<Icon name="copy" size="sm" />}
              onClick={() => onCopy(list)}
            >
              {t("copy")}
            </Button>
          </span>
        </div>
      ) : null}
      {result.skipped.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="bulk-skipped">
          <p className="font-semibold">{t("skippedTitle")}</p>
          <ul className="flex flex-col gap-1">
            {result.skipped.map(({ email, reason }) => (
              <li key={email}>
                <bdi dir="ltr" className="break-all font-mono">
                  {email}
                </bdi>
                {": "}
                {words(`reasons.${skipReasonKey(reason)}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
