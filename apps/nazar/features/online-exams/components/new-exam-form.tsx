"use client";

import type { ExamKind } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { createOnlineExam } from "../actions";
import { onlineExamErrorKey, segmentOf } from "../online-exams";

/**
 * "Yeni sınav": a draft with its title; the page opens it to prepare. With
 * `kind: PRACTICE` it is "Yeni çalışma seti" (MDRS-248), opened under
 * "Çalışma Soruları".
 */
export function NewExamForm({
  courseId,
  kind = "EXAM",
}: {
  courseId: string;
  kind?: ExamKind;
}) {
  const practice = kind === "PRACTICE";
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim() === "") return;
    setBusy(true);
    const result = await createOnlineExam(courseId, title.trim(), kind);
    setBusy(false);
    if (handleUnauthenticated(result)) return;
    if (!result.success) {
      notify({
        tone: "error",
        title: t("OnlineExams.failed"),
        description: words(onlineExamErrorKey(result.code)),
      });
      return;
    }
    router.push(`/ders/${courseId}/${segmentOf(kind)}/${result.data.id}`);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={submit}
      noValidate
    >
      <Field
        label={
          practice
            ? t("Practice.newTitleLabel")
            : t("OnlineExams.newTitleLabel")
        }
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            practice
              ? t("Practice.newTitlePlaceholder")
              : t("OnlineExams.newTitlePlaceholder")
          }
          maxLength={200}
          className={practice ? "w-80 max-w-full" : undefined}
        />
      </Field>
      <Button type="submit" loading={busy} disabled={title.trim() === ""}>
        {practice ? t("Practice.newSet") : t("OnlineExams.newExam")}
      </Button>
    </form>
  );
}
