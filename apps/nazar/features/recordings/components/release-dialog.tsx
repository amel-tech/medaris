"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { dayMonthClock } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { setRecordingAvailability } from "../actions";
import {
  releaseChange,
  releaseErrorKey,
  releaseFormOf,
  releaseProblem,
} from "../recordings";
import { ReleaseFields } from "./release-fields";

/**
 * "Kayıt erişimi" of one session (MDRS-288), from its Ders kayıtları row or
 * its Celseler row: when its talebe may watch its recording, alone, through
 * `PUT /lessons/:id/recording-availability`. The time is kept on the session,
 * so it can be set before a recording exists, and the course version is not
 * involved. Nothing is written when the choice is what the session holds; a
 * refusal is worded from its code, and a session that is gone closes the
 * dialog and reads the page again.
 */
export function ReleaseDialog({
  lessonId,
  session,
  held,
  timeZone,
  onClose,
  onDone,
}: {
  lessonId: string;
  /** the session's title, over the dialog's title */
  session: string;
  /** the ISO time the session holds; null: as soon as it is ready */
  held: string | null;
  /** the course's zone */
  timeZone: string;
  onClose: () => void;
  /** called once the time was written, or the page is out of date */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(() => releaseFormOf(held, timeZone));
  const [sent, setSent] = useState(false);
  const problem = releaseProblem(form, held, timeZone, new Date());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (problem) {
      setSent(true);
      return;
    }
    const change = releaseChange(form, held, timeZone);
    if (!change) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await setRecordingAvailability(
        lessonId,
        change.availableAt
      );
      if (handleUnauthenticated(result)) return;
      if (!result.success) {
        notify({
          tone: "error",
          title: t("Recordings.release.failed"),
          description: words(releaseErrorKey(result.code)),
        });
        if (result.code === "LESSON_NOT_FOUND") {
          onClose();
          onDone();
        }
        return;
      }
      notify({
        title: t("Recordings.release.saved"),
        description: change.availableAt
          ? t("Recordings.release.savedAt", {
              session,
              when: dayMonthClock(
                new Date(change.availableAt),
                locale,
                timeZone
              ),
            })
          : t("Recordings.release.savedReady", { session }),
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
      eyebrow={session}
      title={t("Recordings.release.title")}
      closeLabel={t("Shell.close")}
      footer={
        <>
          <DialogClose>{t("Recordings.form.cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {t("Recordings.form.submitEdit")}
          </Button>
        </>
      }
    >
      <ReleaseFields
        value={form}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        timeZone={timeZone}
        problem={sent ? problem : null}
        disabled={pending}
      />
    </Dialog>
  );
}
