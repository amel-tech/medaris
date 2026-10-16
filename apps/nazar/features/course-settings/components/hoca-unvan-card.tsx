"use client";

import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { setHocaUnvan } from "../actions";
import {
  type HocaRow,
  NO_UNVAN,
  shownName,
  unvanChanges,
  unvanErrorKey,
  unvanOptions,
} from "../hoca-unvan";

/**
 * "Hocalar ve unvanları" of Ders ayarları (owner, 2026-10-15): each hoca of
 * the course with the unvan they carry in it, chosen from a select whose
 * first option is the untitled "Hoca". The line under each select says how
 * the course will show the name ("Prof. Dr. Ahmet Mehmet", "Ahmet Mehmet
 * Hoca"). Like the form above it, the selects wait for Kaydet, and Kaydet is
 * off until something differs. Each changed hoca is one
 * `PUT /courses/:id/muderris/:userId/unvan`, in list order; a refusal stops
 * there, is worded from its code in a toast that stays, and the page is read
 * again so it shows what is stored.
 *
 * Without `course.settings` the card shows the same rows with the selects
 * shut and says the caller may only look, as the form does for its boxes. A
 * hoca shown by name alone, with no account, keeps a shut select: tedrisat
 * sets an unvan by account.
 */
export function HocaUnvanCard({
  courseId,
  courseTitle,
  hocas,
  editable,
}: {
  courseId: string;
  courseTitle: string;
  hocas: HocaRow[];
  editable: boolean;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [refreshing, startRefresh] = useTransition();
  const [saved, setSaved] = useState(hocas);
  const [draft, setDraft] = useState(hocas);
  const [saving, setSaving] = useState(false);
  const options = useMemo(
    () => unvanOptions(t("CourseSettings.hocas.untitled")),
    [t]
  );

  const busy = saving || refreshing;
  const changes = unvanChanges(saved, draft);
  const dirty = changes.length > 0;
  const refresh = () => startRefresh(() => router.refresh());
  const choose = (index: number, value: string | null) =>
    setDraft((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, unvan: value || NO_UNVAN } : row
      )
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || busy || !editable) return;
    setSaving(true);
    let now = saved;
    for (const change of changes) {
      const result = await setHocaUnvan(courseId, change.userId, change.unvan);
      if (handleUnauthenticated(result)) return;
      if (!result.success) {
        setSaving(false);
        setSaved(now);
        notify({
          tone: "error",
          title: t("CourseSettings.hocas.failed"),
          description: words(unvanErrorKey(result.code)),
        });
        refresh();
        return;
      }
      now = now.map((row) =>
        row.userId === change.userId
          ? { ...row, unvan: result.data.unvan ?? NO_UNVAN }
          : row
      );
    }
    setSaving(false);
    setSaved(draft);
    notify({
      title: t("CourseSettings.hocas.saved"),
      description: t("CourseSettings.hocas.savedBody", { name: courseTitle }),
    });
    refresh();
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mds-card flex min-inline-0 flex-col gap-section p-card"
      aria-labelledby="course-hocas-heading"
      data-testid="hoca-unvan-card"
    >
      <div className="flex flex-col gap-1">
        <h2 className="mds-h2" id="course-hocas-heading">
          {t("CourseSettings.hocas.title")}
        </h2>
        <p className="mds-body-sm text-neutral-muted">
          {t("CourseSettings.hocas.intro")}
        </p>
      </div>
      {draft.length === 0 ? (
        <p className="mds-body-sm">{t("CourseSettings.hocas.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-section">
          {draft.map((row, index) => (
            <li key={row.userId ?? `${row.name}-${index}`}>
              <Field
                label={t("CourseSettings.hocas.unvanLabel", {
                  name: row.name,
                })}
                help={
                  row.userId
                    ? t("CourseSettings.hocas.shownAs", {
                        name: shownName(row),
                      })
                    : t("CourseSettings.hocas.noAccount", {
                        name: shownName(row),
                      })
                }
              >
                <Select
                  name={`unvan-${index}`}
                  value={row.unvan}
                  onChange={(value) => choose(index, value)}
                  disabled={busy || !editable || !row.userId}
                  options={options}
                />
              </Field>
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || busy}
            onClick={() => setDraft(saved)}
          >
            {t("CourseSettings.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!dirty}
            loading={busy}
            loadingLabel={t("CourseSettings.saving")}
          >
            {t("CourseSettings.save")}
          </Button>
        </div>
      ) : (
        <p className="mds-caption">{t("CourseSettings.hocas.readOnly")}</p>
      )}
    </form>
  );
}
