"use client";

import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { cancelSession, createSessions } from "../actions";
import {
  courseMoved,
  makeUpFields,
  makeUpRequest,
  type SessionRow,
  sessionErrorKey,
  whenLabel,
} from "../sessions";

/**
 * "Celseyi iptal et": the session stays in the programme, marked cancelled, and
 * talebe see it so. A make-up can be added in the same step: the API has no
 * link between a cancelled session and its make-up, so it is a new session of
 * the same length, made after the cancellation (its date and time start a week
 * later, on the viewer's clock). When the cancellation went through and the
 * make-up did not, the dialog says exactly that, and the session stays
 * cancelled.
 */
export function CancelDialog({
  row,
  courseId,
  version,
  locale,
  timeZone,
  onClose,
  onVersion,
  onDone,
}: {
  row: SessionRow;
  courseId: string;
  version: number;
  locale: string;
  timeZone: string;
  onClose: () => void;
  /** the course version the cancellation left, for the writes after it */
  onVersion: (version: number) => void;
  /** called once something was written, or the course has moved, for the page to read it again */
  onDone: () => void;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [makeUp, setMakeUp] = useState(false);
  const [fields, setFields] = useState(() => makeUpFields(row.start, timeZone));
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const request = makeUp
      ? makeUpRequest(
          row,
          { ...fields, timeZone },
          t("Sessions.cancelDialog.makeUpSuffix")
        )
      : null;
    if (makeUp && !request) {
      setProblem(t("Sessions.errors.time"));
      return;
    }
    startTransition(async () => {
      const cancelled = await cancelSession(row.id, version);
      if (!cancelled.success) {
        notify({
          tone: "error",
          title: t("Sessions.failed"),
          description: words(sessionErrorKey(cancelled.code)),
        });
        if (courseMoved(cancelled.code)) {
          onClose();
          onDone();
        }
        return;
      }
      onVersion(cancelled.data.courseVersion);
      if (request) {
        const created = await createSessions(courseId, request);
        if (!created.success) {
          notify({
            tone: "error",
            title: t("Sessions.cancelDialog.makeUpFailed"),
            description: words(sessionErrorKey(created.code)),
          });
          onClose();
          onDone();
          return;
        }
      }
      notify({
        title: t("Sessions.cancelledToast"),
        description: t(
          request
            ? "Sessions.cancelDialog.madeUpBody"
            : "Sessions.cancelledBody",
          { name: row.title }
        ),
      });
      onClose();
      onDone();
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      form
      onSubmit={submit}
      eyebrow={row.title}
      title={t("Sessions.cancelTitle")}
      closeLabel={t("Shell.close")}
      footer={
        <>
          <DialogClose>{t("Sessions.formCancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {t("Sessions.cancelConfirm")}
          </Button>
        </>
      }
    >
      <p>
        {t("Sessions.cancelBody", {
          when: whenLabel(row.start, { locale, timeZone }, "full"),
        })}
      </p>
      <p className="mds-caption">{t("Sessions.cancelWay")}</p>
      <Checkbox
        label={t("Sessions.cancelDialog.makeUp")}
        description={t("Sessions.cancelDialog.makeUpHelp")}
        checked={makeUp}
        disabled={pending}
        onCheckedChange={(checked) => {
          setMakeUp(checked);
          setProblem(null);
        }}
      />
      {makeUp ? (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="make-up">
          <Field
            label={t("Sessions.dateLabel")}
            required
            error={problem ?? undefined}
          >
            <Input
              type="date"
              name="makeUpDate"
              value={fields.date}
              disabled={pending}
              onChange={(event) =>
                setFields({ ...fields, date: event.target.value })
              }
            />
          </Field>
          <Field label={t("Sessions.timeLabel")} required>
            <Input
              type="time"
              name="makeUpTime"
              value={fields.time}
              disabled={pending}
              onChange={(event) =>
                setFields({ ...fields, time: event.target.value })
              }
            />
          </Field>
        </div>
      ) : null}
    </Dialog>
  );
}
