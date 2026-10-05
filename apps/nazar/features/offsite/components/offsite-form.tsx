"use client";

import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { genitive, TITLE_MAX, TITLE_MIN } from "~/features/courses/courses";
import type { Messages } from "~/lib/i18n/messages";
import { sendOffsiteRequest } from "../actions";
import {
  type OffsiteForm as Draft,
  offsiteErrorKey,
  offsiteProblems,
  offsiteRequest,
  REASON_MAX,
} from "../offsite";

/**
 * The form of "Medrese dışı ders talebi" (nazir 09): the köşk, the name and the
 * reason, and in a card beside them what happens next. The first köşk is
 * chosen, as the design draws it. The button is never off: a problem is written
 * under its field when "Talebi gönder" is pressed and the focus goes to the
 * first. A request that is sent makes no course; the page goes back to Dersler
 * with a toast.
 */
export function OffsiteForm({
  madrasahId,
  kosks,
  listHref,
}: {
  madrasahId: string;
  kosks: Array<{ id: string; name: string }>;
  listHref: string;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>({
    koskId: kosks[0]?.id ?? null,
    title: "",
    reason: "",
  });
  const [attempted, setAttempted] = useState(false);

  const problems = offsiteProblems(draft);
  const kosk = kosks.find((candidate) => candidate.id === draft.koskId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (problems) {
      const field = problems.title
        ? "title"
        : problems.reason
          ? "reason"
          : null;
      const element = field
        ? event.currentTarget.elements.namedItem(field)
        : null;
      if (element instanceof HTMLElement) element.focus();
      return;
    }
    if (pending) return;
    startTransition(async () => {
      const result = await sendOffsiteRequest(
        madrasahId,
        offsiteRequest(draft)
      );
      if (result.success) {
        notify({
          title: t("Offsite.sent"),
          description: t("Offsite.sentBody", {
            title: result.data.title,
            kosk: result.data.koskName,
            koskGenitive: genitive(result.data.koskName, locale),
          }),
        });
        router.push(listHref);
        return;
      }
      notify({
        tone: "error",
        title: t("Offsite.failedTitle"),
        description: words(offsiteErrorKey(result.code)),
      });
      if (result.code === "KOSK_NOT_FOUND") router.refresh();
    });
  };

  const after: Array<{ icon: IconName; text: string }> = [
    {
      icon: "inbox",
      text: kosk
        ? t("Offsite.after.oneNamed", {
            kosk: kosk.name,
            koskGenitive: genitive(kosk.name, locale),
          })
        : t("Offsite.after.one"),
    },
    { icon: "kosk", text: t("Offsite.after.two") },
    { icon: "medrese", text: t("Offsite.after.three") },
  ];

  return (
    <form
      noValidate
      onSubmit={submit}
      className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start"
      data-testid="offsite-form"
    >
      <div className="flex min-inline-0 flex-col gap-section">
        <p className="mds-caption">* {t("Offsite.required")}</p>
        <Field
          label={t("Offsite.kosk.label")}
          required
          help={t("Offsite.kosk.help")}
          error={
            attempted && problems?.kosk ? t("Offsite.kosk.required") : undefined
          }
        >
          <Select
            name="kosk"
            placeholder={t("Offsite.kosk.placeholder")}
            options={kosks.map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
            }))}
            value={draft.koskId}
            onChange={(value) => setDraft({ ...draft, koskId: value })}
          />
        </Field>
        <Field
          label={t("Offsite.name")}
          required
          help={t("Offsite.nameHelp")}
          error={
            attempted && problems?.title
              ? t(`OpenCourse.nameProblems.${problems.title}`, {
                  min: TITLE_MIN,
                  max: TITLE_MAX,
                })
              : undefined
          }
        >
          <Input
            name="title"
            required
            autoComplete="off"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <Field
          label={t("Offsite.reason")}
          required
          help={t("Offsite.reasonHelp")}
          error={
            attempted && problems?.reason
              ? t(`Offsite.reasonProblems.${problems.reason}`, {
                  max: REASON_MAX,
                })
              : undefined
          }
        >
          <Textarea
            name="reason"
            required
            rows={5}
            value={draft.reason}
            onChange={(event) =>
              setDraft({ ...draft, reason: event.target.value })
            }
          />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" href={listHref}>
            {t("Offsite.cancel")}
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingLabel={t("Offsite.sending")}
          >
            {t("Offsite.submit")}
          </Button>
        </div>
      </div>

      <section
        aria-labelledby="offsite-after-heading"
        className="mds-card flex flex-col gap-4 p-card"
      >
        <h2 className="mds-h3" id="offsite-after-heading">
          {t("Offsite.afterTitle")}
        </h2>
        <ul className="flex flex-col">
          {after.map((item) => (
            <li
              key={item.icon}
              className="flex items-start gap-3 py-3 border-be border-neutral-subtle first:pt-0 last:border-be-0 last:pb-0"
            >
              <Icon name={item.icon} size="sm" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
