"use client";

import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { DEFAULT_TIME_ZONE, listTimeZones, timeZoneCity } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { saveCourseSettings, setSampleLesson } from "../actions";
import {
  type CourseSettingsControls,
  type CourseSettingsValues,
  courseSettingsErrorKey,
  courseSettingsPatch,
  sampleOptions,
  settingsDirty,
  settingsOf,
} from "../course-settings";

// The select has no "empty" value: "none" stands for no sample session.
const NONE = "none";

/**
 * "Erişim, kayıt ve saat dilimi" of Ders ayarları (nizam 34 in nazar's form
 * idiom): Kapalı ders, Örnek ders, Kayıt onayı gereksin and Saat dilimi. The
 * boxes are checkboxes, not switches: they wait for Kaydet. Each control is
 * open only when the caller holds what its route asks (`controlsOf`); a box a
 * policy holds is shown ticked and says why. Kaydet is off until something
 * differs. The sample session moves first, with its own writes: the old one
 * is unset with the page's version, then the new one is set with the version
 * that write returned, so a failure leaves no sample rather than two (nizam's
 * order). Then one `PATCH /courses/:id` carries only the course fields that
 * changed. A refusal is worded from its code in a toast that stays; a save
 * that wrote part of the change reads the page again so it shows what is
 * stored.
 */
export function CourseSettingsForm({
  course,
  controls,
}: {
  course: CourseDetailResponse;
  controls: CourseSettingsControls;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [refreshing, startRefresh] = useTransition();
  const [saved, setSaved] = useState<CourseSettingsValues>(() =>
    settingsOf(course)
  );
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => listTimeZones(draft.timeZone), [draft.timeZone]);
  const options = useMemo(() => sampleOptions(course), [course]);

  const busy = saving || refreshing;
  const dirty = settingsDirty(saved, draft);
  const set = <K extends keyof CourseSettingsValues>(
    key: K,
    value: CourseSettingsValues[K]
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const refresh = () => startRefresh(() => router.refresh());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || busy) return;
    setSaving(true);
    // What the course holds as each write lands, so a save stopped half-way
    // leaves the form saying what is stored.
    let now = saved;
    let version = course.version;
    const stop = (code: string, description?: string) => {
      setSaving(false);
      setSaved(now);
      notify({
        tone: "error",
        title: t("CourseSettings.failed"),
        description: description ?? words(courseSettingsErrorKey(code)),
      });
      // A stale version is read again too, or every retry would send it.
      if (now !== saved || code === "COURSE_VERSION_CONFLICT") refresh();
    };

    if (draft.sampleLessonId !== saved.sampleLessonId) {
      if (saved.sampleLessonId) {
        const result = await setSampleLesson(saved.sampleLessonId, {
          version,
          isPreview: false,
        });
        if (!result.success) {
          stop(result.code);
          return;
        }
        version = result.data.courseVersion;
        now = { ...now, sampleLessonId: "" };
      }
      if (draft.sampleLessonId) {
        const result = await setSampleLesson(draft.sampleLessonId, {
          version,
          isPreview: true,
        });
        if (!result.success) {
          stop(
            result.code,
            now.sampleLessonId === saved.sampleLessonId
              ? undefined
              : t("CourseSettings.sampleFailed")
          );
          return;
        }
        now = { ...now, sampleLessonId: draft.sampleLessonId };
      }
    }
    const patch = courseSettingsPatch(saved, draft);
    if (patch) {
      const result = await saveCourseSettings(course.id, patch);
      if (!result.success) {
        stop(result.code);
        return;
      }
    }
    setSaving(false);
    setSaved(draft);
    notify({
      title: t("CourseSettings.saved"),
      description: t("CourseSettings.savedBody", { name: course.title }),
    });
    refresh();
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mds-card flex min-inline-0 flex-col gap-section p-card"
      aria-labelledby="course-access-heading"
      data-testid="course-settings-form"
    >
      <h2 className="mds-h2" id="course-access-heading">
        {t("CourseSettings.accessTitle")}
      </h2>
      {controls.needsEdit ? (
        <Alert>
          <p>{t("CourseSettings.needsEdit")}</p>
        </Alert>
      ) : null}
      <Checkbox
        bordered
        icon={<Icon name="lock" size="sm" />}
        label={t("CourseSettings.closedLabel")}
        description={t(
          controls.closed === "locked"
            ? "CourseSettings.closedLocked"
            : "CourseSettings.closedDesc"
        )}
        checked={draft.isClosed}
        disabled={busy || controls.closed !== "open"}
        onCheckedChange={(checked) => set("isClosed", checked === true)}
        name="isClosed"
      />
      <Field
        label={t("CourseSettings.sampleLabel")}
        help={t("CourseSettings.sampleHelp")}
      >
        <Select
          name="sample"
          value={draft.sampleLessonId || NONE}
          onChange={(value) =>
            set("sampleLessonId", !value || value === NONE ? "" : value)
          }
          disabled={busy || !controls.sample}
          options={options.map((option) => ({
            value: option.value || NONE,
            label:
              option.weekNumber === null
                ? t("CourseSettings.sampleNone")
                : t("CourseSettings.sampleOption", {
                    week: option.weekNumber,
                    title: option.title ?? "",
                  }),
          }))}
        />
      </Field>
      <Checkbox
        bordered
        icon={<Icon name="users" size="sm" />}
        label={t("CourseSettings.approvalLabel")}
        description={t(
          controls.approval === "locked"
            ? "CourseSettings.approvalLocked"
            : "CourseSettings.approvalDesc"
        )}
        checked={controls.approval === "locked" || draft.requiresApproval}
        disabled={busy || controls.approval !== "open"}
        onCheckedChange={(checked) => set("requiresApproval", checked === true)}
        name="requiresApproval"
      />
      <Field
        label={t("CourseSettings.zoneLabel")}
        help={t("CourseSettings.zoneHelp")}
      >
        <Select
          name="timeZone"
          value={draft.timeZone}
          onChange={(value) => value && set("timeZone", value)}
          disabled={busy || !controls.zone}
          options={zones.map((zone) => ({
            value: zone,
            label:
              zone === DEFAULT_TIME_ZONE
                ? t("CourseSettings.zoneIstanbul")
                : timeZoneCity(zone),
          }))}
        />
      </Field>
      {controls.save ? (
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
        <p className="mds-caption">{t("CourseSettings.readOnly")}</p>
      )}
    </form>
  );
}
