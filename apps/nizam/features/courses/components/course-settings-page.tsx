"use client";

import type {
  CourseDetailResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Select } from "@medaris/ui/mds/select";
import { DEFAULT_TIME_ZONE, listTimeZones, timeZoneCity } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { updateKosk } from "~/features/kosks/actions";
import { HideCourseDialog } from "~/features/kosks/components/hide-course-dialog";
import { patchCourse, patchLesson } from "../actions";
import {
  courseErrorKey,
  effectiveApproval,
  type SettingsForm,
  sampleOf,
  sampleOptions,
  settingsChanged,
  settingsOf,
} from "../present";
import { MuderrisDialog } from "./muderris-dialog";

interface Props {
  kosk: KoskResponse;
  course: CourseDetailResponse;
  /** the talebe enrolled, for "Taslağa çek"; null when it could not be read */
  enrolledCount: number | null;
  /** the köşk manager: may change the team, hide the course and set the köşk policy */
  manager: boolean;
  /** tedris's address, for "Tanıtım sayfasını gör"; null when this deployment has none */
  tedrisUrl: string | null;
}

/**
 * Ders ayarları (nizam 34): the course's access, enrolment and time zone, its
 * publication, its team and "Dersi gizle". "Kaydet" sends only what changed
 * and does nothing while nothing did; "Vazgeç" puts the course's values back.
 * With the köşk policy "Her zaman kayıt onayı" the approval box is checked and
 * off-limits. The köşk policy on recordings is the köşk's, changed here by the
 * manager and saved with the rest.
 */
export function CourseSettingsPage({
  kosk,
  course,
  enrolledCount,
  manager,
  tedrisUrl,
}: Props) {
  const t = useTranslations("nizam.CourseSettings");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const stored = useMemo(() => settingsOf(course), [course]);
  const [form, setForm] = useState<SettingsForm>(stored);
  const [neverPublic, setNeverPublic] = useState(kosk.recordingsNeverPublic);
  const [saving, setSaving] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const zones = useMemo(() => listTimeZones(form.timeZone), [form.timeZone]);

  const base = `/${locale}/kosks/${kosk.id}`;
  const courseBase = `${base}/courses/${course.id}`;
  const policyChanged = neverPublic !== kosk.recordingsNeverPublic;
  const dirty = settingsChanged(form, stored) || policyChanged;
  const fixed = kosk.alwaysRequireApproval;
  const published = course.status === "PUBLISHED";
  const options = sampleOptions(course);
  // The select has no "empty" value: "none" stands for no sample session.
  const NONE = "none";

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const fail = (errorBody: unknown) =>
    toast.error(t("failed"), {
      description: t(`errors.${courseErrorKey(errorBody)}` as never),
      duration: Number.POSITIVE_INFINITY,
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    let version = course.version;
    // The sample session moves with its own writes, one after the other: each
    // returns the course version the next one carries.
    if (form.sampleLessonId !== stored.sampleLessonId) {
      const previous = sampleOf(course);
      if (previous) {
        const res = await patchLesson(kosk.id, course.id, previous, {
          version,
          isPreview: false,
        });
        if (!res.success) {
          setSaving(false);
          fail(res.errorBody);
          return;
        }
        version = res.data.courseVersion;
      }
      if (form.sampleLessonId) {
        const res = await patchLesson(kosk.id, course.id, form.sampleLessonId, {
          version,
          isPreview: true,
        });
        if (!res.success) {
          setSaving(false);
          fail(res.errorBody);
          return;
        }
        version = res.data.courseVersion;
      }
    }
    const courseChanges = {
      ...(form.isClosed !== stored.isClosed ? { isClosed: form.isClosed } : {}),
      ...(form.requiresApproval !== stored.requiresApproval
        ? { requiresApproval: form.requiresApproval }
        : {}),
      ...(form.timeZone !== stored.timeZone ? { timeZone: form.timeZone } : {}),
    };
    if (Object.keys(courseChanges).length > 0) {
      const res = await patchCourse(kosk.id, course.id, courseChanges);
      if (!res.success) {
        setSaving(false);
        fail(res.errorBody);
        return;
      }
    }
    if (policyChanged && manager) {
      const res = await updateKosk(kosk.id, {
        recordingsNeverPublic: neverPublic,
      });
      if (!res.success) {
        setSaving(false);
        fail(res.errorBody);
        return;
      }
    }
    setSaving(false);
    toast.success(t("saved"), {
      description: t("savedBody", { name: course.title }),
    });
    refresh();
  };

  const changeStatus = async (status: "DRAFT" | "PUBLISHED") => {
    setPublishBusy(true);
    const res = await patchCourse(kosk.id, course.id, { status });
    setPublishBusy(false);
    if (!res.success) {
      fail(res.errorBody);
      return;
    }
    setUnpublishing(false);
    toast.success(t(status === "DRAFT" ? "drafted" : "published"), {
      description: t("savedBody", { name: course.title }),
    });
    refresh();
  };

  return (
    <div
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      data-testid="course-settings"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[48rem] flex-col gap-3">
          <Breadcrumb
            label={t("breadcrumbLabel")}
            items={[
              { label: t("breadcrumbRoot"), href: `${base}/dersler` },
              { label: course.title, href: courseBase },
              t("breadcrumbCurrent"),
            ]}
          />
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro", { name: course.title })}</p>
        </div>
        {tedrisUrl ? (
          <Button
            variant="outline"
            href={`${tedrisUrl}/${locale}/courses/${course.id}`}
            target="_blank"
            rel="noopener noreferrer"
            iconRight={<Icon name="share" size="sm" />}
          >
            {t("viewPublic")}
          </Button>
        ) : null}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form className="mds-card flex flex-col gap-5" onSubmit={submit}>
          <h2 className="mds-h2">{t("accessTitle")}</h2>
          <Checkbox
            bordered
            icon={<Icon name="lock" size="sm" />}
            label={t("closedLabel")}
            description={t("closedDesc")}
            checked={form.isClosed}
            disabled={saving}
            onCheckedChange={(v) => set("isClosed", v === true)}
            name="isClosed"
          />
          <Field label={t("sampleLabel")} help={t("sampleHelp")}>
            <Select
              name="sample"
              value={form.sampleLessonId || NONE}
              onChange={(v) => set("sampleLessonId", !v || v === NONE ? "" : v)}
              disabled={saving}
              options={options.map((o) => ({
                value: o.value || NONE,
                label:
                  o.weekNumber === null
                    ? t("sampleNone")
                    : t("sampleOption", {
                        week: o.weekNumber,
                        title: o.title ?? "",
                      }),
              }))}
            />
          </Field>
          <Checkbox
            bordered
            icon={<Icon name="users" size="sm" />}
            label={t("approvalLabel")}
            description={t(fixed ? "approvalFixed" : "approvalDesc")}
            checked={effectiveApproval(form, fixed)}
            disabled={saving || fixed}
            onCheckedChange={(v) => set("requiresApproval", v === true)}
            name="requiresApproval"
          />
          <Field label={t("zoneLabel")} help={t("zoneHelp")}>
            <Select
              name="timeZone"
              value={form.timeZone}
              onChange={(v) => v && set("timeZone", v)}
              disabled={saving}
              options={zones.map((zone) => ({
                value: zone,
                label:
                  zone === DEFAULT_TIME_ZONE
                    ? t("zoneIstanbul")
                    : timeZoneCity(zone),
              }))}
            />
          </Field>

          <hr className="mds-divider" />
          <h3 className="mds-h3">{t("policyTitle")}</h3>
          <p className="mds-caption">
            {t("policyIntro", { kosk: kosk.name })}{" "}
            <a className="mds-link" href={`${base}/ayarlar`}>
              {t("policyLink")}
            </a>
          </p>
          <Checkbox
            bordered
            icon={<Icon name="video" size="sm" />}
            label={t("neverPublicLabel")}
            description={t("neverPublicDesc")}
            checked={neverPublic}
            disabled={saving || !manager}
            onCheckedChange={(v) => setNeverPublic(v === true)}
            name="recordingsNeverPublic"
          />

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              type="button"
              disabled={saving || !dirty}
              onClick={() => {
                setForm(stored);
                setNeverPublic(kosk.recordingsNeverPublic);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              loading={saving}
              loadingLabel={t("saving")}
              disabled={!dirty}
            >
              {t("save")}
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-6">
          <section
            className="mds-card flex flex-col gap-3"
            aria-labelledby="s-publish"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="s-publish" className="mds-h2">
                {t("publishTitle")}
              </h2>
              <Badge variant={published ? "success" : "secondary"}>
                {t(published ? "statusPublished" : "statusDraft")}
              </Badge>
            </div>
            <p>{t(published ? "publishedBody" : "draftBody")}</p>
            {published ? (
              <p className="mds-caption">
                {enrolledCount === null
                  ? t("unpublishNote")
                  : t("unpublishNoteCount", { count: enrolledCount })}
              </p>
            ) : null}
            <div>
              {published ? (
                <Button
                  variant="secondary"
                  onClick={() => setUnpublishing(true)}
                >
                  {t("unpublish")}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={publishBusy}
                  onClick={() => void changeStatus("PUBLISHED")}
                >
                  {t("publish")}
                </Button>
              )}
            </div>
          </section>

          <section
            className="mds-card flex flex-col gap-3"
            aria-labelledby="s-team"
          >
            <h2 id="s-team" className="mds-h2">
              {t("teamTitle")}
            </h2>
            <ul className="flex flex-col gap-3">
              {course.muderris.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.name} decorative />
                  <span className="min-w-0 flex-1">
                    <bdi>{m.name}</bdi>
                  </span>
                  {m.isImam ? (
                    <Badge variant="secondary">{t("imam")}</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
            {manager ? (
              <div>
                <Button variant="outline" onClick={() => setEditingTeam(true)}>
                  {t("editTeam")}
                </Button>
              </div>
            ) : null}
          </section>

          {manager ? (
            <section
              className="mds-card flex flex-col gap-3"
              aria-labelledby="s-hide"
            >
              <h2 id="s-hide" className="mds-h2">
                {t("hideTitle")}
              </h2>
              <p>{t("hideBody")}</p>
              <div>
                <Button
                  variant="outline"
                  iconLeft={<Icon name="eye" size="sm" />}
                  onClick={() => setHiding(true)}
                >
                  {t("hide")}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={unpublishing}
        onOpenChange={(next) => {
          if (!publishBusy) setUnpublishing(next);
        }}
        eyebrow={course.title}
        title={t("unpublishTitle")}
        confirmLabel={t("unpublishConfirm")}
        cancelLabel={t("cancel")}
        closeLabel={t("close")}
        confirmLoading={publishBusy}
        onConfirm={() => void changeStatus("DRAFT")}
      >
        <p>{t("unpublishBody", { name: course.title })}</p>
        <p className="mds-caption">{t("unpublishWay")}</p>
      </AlertDialog>
      <MuderrisDialog
        open={editingTeam}
        onOpenChange={setEditingTeam}
        koskId={kosk.id}
        courseId={course.id}
        courseTitle={course.title}
        onSaved={refresh}
      />
      <HideCourseDialog
        open={hiding}
        onOpenChange={setHiding}
        courseId={course.id}
        courseTitle={course.title}
        onHidden={() => router.push(`${base}/dersler`)}
      />
    </div>
  );
}
