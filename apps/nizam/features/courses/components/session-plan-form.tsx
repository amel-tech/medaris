"use client";

import type {
  CourseDetailResponse,
  PlannedSessionResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Select } from "@medaris/ui/mds/select";
import {
  listTimeZones,
  normalizeMeetingUrl,
  timeZoneCity,
} from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  createCourseSessions,
  previewCourseSessions,
} from "~/features/kosks/actions/courses";
import { formatInstant, weekdayName } from "../format";
import {
  courseErrorKey,
  linkProblem,
  type PlanForm,
  planErrors,
  planPattern,
  planSummary,
  WEEKDAYS,
} from "../present";

interface Props {
  kosk: { id: string; name: string };
  course: Pick<CourseDetailResponse, "id" | "title" | "timeZone">;
}

type Links = "empty" | "first";

/**
 * Celse planla (nizam 55): one session, or a weekly repeat, made in one go. The
 * preview on the right is tedrisat's own expansion of the pattern (the same
 * call that saves it), so it shows the week each session lands in. Nothing is
 * written until "N celse oluştur". Every session has a link of its own, so the
 * links stay empty or go to the first session only.
 */
export function SessionPlanForm({ kosk, course }: Props) {
  const t = useTranslations("nizam.SessionPlan");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState<PlanForm>({
    mode: "weekly",
    weekdays: [],
    startTime: "21:00",
    duration: "60",
    timeZone: course.timeZone,
    startDate: "",
    endMode: "date",
    endDate: "",
    count: "8",
  });
  const [title, setTitle] = useState(t("defaultTitle"));
  const [links, setLinks] = useState<Links>("empty");
  const [firstUrl, setFirstUrl] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PlannedSessionResponse[] | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const zones = useMemo(() => listTimeZones(form.timeZone), [form.timeZone]);
  const problems = planErrors(form);
  const pattern = planPattern(form);
  const base = `/${locale}/kosks/${kosk.id}/courses/${course.id}`;

  // The preview follows the fields, a moment after the last key.
  const patternKey = pattern ? JSON.stringify(pattern) : null;
  useEffect(() => {
    if (!pattern) {
      setPreview(null);
      setPreviewFailed(false);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const res = await previewCourseSessions(course.id, pattern);
      if (!live) return;
      if (res.success) {
        setPreview(res.data.sessions);
        setPreviewFailed(false);
      } else {
        setPreview(null);
        setPreviewFailed(true);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [patternKey, course.id]);

  const summary = planSummary(preview ?? []);
  const titleProblem = title.trim().length === 0;
  const urlProblem =
    links === "first" &&
    (!normalizeMeetingUrl(firstUrl) || linkProblem(firstUrl) !== null);
  const hasProblem =
    Object.keys(problems).length > 0 || titleProblem || urlProblem;
  const count = preview?.length ?? 0;

  const show = (flag: boolean, key: string) =>
    sent && flag ? t(`errors.${key}` as never) : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (hasProblem || !pattern) {
      setSent(true);
      return;
    }
    setSaving(true);
    const res = await createCourseSessions(kosk.id, course.id, {
      ...pattern,
      title: title.trim(),
      durationMinutes: Number(form.duration),
      ...(links === "first"
        ? { meetingUrl: normalizeMeetingUrl(firstUrl) }
        : {}),
    });
    setSaving(false);
    if (!res.success) {
      toast.error(t("failed"), {
        description: t(`errors.api.${courseErrorKey(res.errorBody)}` as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("created"), {
      description: t("createdBody", { count: res.data.lessons.length }),
    });
    router.push(`${base}/sessions`);
  };

  return (
    <form
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      onSubmit={submit}
      noValidate
      data-testid="session-plan"
    >
      <header className="flex max-w-[48rem] flex-col gap-3">
        <Breadcrumb
          label={t("breadcrumbLabel")}
          items={[
            { label: t("breadcrumbRoot"), href: `${base}/sessions` },
            t("breadcrumbCurrent"),
          ]}
        />
        <h1 className="mds-h1">{t("title")}</h1>
        <p>{t("intro")}</p>
        <p className="mds-caption">* {t("requiredNote")}</p>
      </header>

      <ChoiceChips
        legend={t("modeLegend")}
        legendVisible
        name="mode"
        value={form.mode}
        onChange={(v) => v && set("mode", v as PlanForm["mode"])}
        options={[
          { value: "single", label: t("modeSingle") },
          { value: "weekly", label: t("modeWeekly") },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            className="mds-card flex flex-col gap-4"
            aria-labelledby="p-rep"
          >
            <h2 id="p-rep" className="mds-h2">
              {form.mode === "weekly" ? t("repeatTitle") : t("singleTitle")}
            </h2>
            {form.mode === "weekly" ? (
              <div className="flex flex-col gap-2">
                <ChoiceChips
                  multiple
                  legend={`${t("daysLegend")} *`}
                  legendVisible
                  name="weekdays"
                  value={form.weekdays.map(String)}
                  onChange={(v) => set("weekdays", v.map(Number))}
                  options={WEEKDAYS.map((d) => ({
                    value: String(d),
                    label: weekdayName(format, d, "short"),
                  }))}
                />
                {sent && problems.weekdays ? (
                  <p className="mds-error" role="alert">
                    {t("errors.weekdays")}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("startTimeLabel")}
                required
                error={show(Boolean(problems.startTime), "startTime")}
              >
                <Input
                  type="time"
                  name="startTime"
                  value={form.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </Field>
              <Field
                label={t("durationLabel")}
                required
                error={show(Boolean(problems.duration), "duration")}
              >
                <Input
                  type="number"
                  name="duration"
                  min={1}
                  max={1440}
                  inputMode="numeric"
                  value={form.duration}
                  trailing={t("durationUnit")}
                  onChange={(e) => set("duration", e.target.value)}
                />
              </Field>
            </div>
            <Field label={t("zoneLabel")} help={t("zoneHelp")}>
              <Select
                name="timeZone"
                value={form.timeZone}
                onChange={(v) => v && set("timeZone", v)}
                options={zones.map((zone) => ({
                  value: zone,
                  label:
                    zone === "Europe/Istanbul"
                      ? t("zoneIstanbul")
                      : timeZoneCity(zone),
                }))}
              />
            </Field>
            <Field
              label={t(form.mode === "weekly" ? "startDateLabel" : "dateLabel")}
              required
              error={show(Boolean(problems.startDate), "startDate")}
            >
              <Input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
            {form.mode === "weekly" ? (
              <>
                <RadioGroup
                  legend={t("endLegend")}
                  name="endMode"
                  value={form.endMode}
                  onChange={(v) => set("endMode", v as PlanForm["endMode"])}
                  options={[
                    { value: "date", label: t("endDate") },
                    { value: "count", label: t("endCount") },
                  ]}
                />
                {form.endMode === "date" ? (
                  <Field
                    label={t("endDateLabel")}
                    required
                    help={t("endDateHelp")}
                    error={
                      problems.endBeforeStart
                        ? show(true, "endBeforeStart")
                        : show(Boolean(problems.endDate), "endDate")
                    }
                  >
                    <Input
                      type="date"
                      name="endDate"
                      value={form.endDate}
                      onChange={(e) => set("endDate", e.target.value)}
                    />
                  </Field>
                ) : (
                  <Field
                    label={t("countLabel")}
                    required
                    error={show(Boolean(problems.count), "count")}
                  >
                    <Input
                      type="number"
                      name="count"
                      min={1}
                      max={200}
                      inputMode="numeric"
                      value={form.count}
                      onChange={(e) => set("count", e.target.value)}
                    />
                  </Field>
                )}
              </>
            ) : null}
          </section>

          <section
            className="mds-card flex flex-col gap-4"
            aria-labelledby="p-ses"
          >
            <h2 id="p-ses" className="mds-h2">
              {t("sessionsTitle")}
            </h2>
            <Field
              label={t("titleLabel")}
              required
              help={t("titleHelp")}
              error={show(titleProblem, "title")}
            >
              <Input
                name="title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <RadioGroup
              legend={t("linksLegend")}
              name="links"
              bordered
              value={links}
              onChange={(v) => setLinks(v as Links)}
              options={[
                {
                  value: "empty",
                  label: t("linksEmpty"),
                  description: t("linksEmptyDesc"),
                },
                {
                  value: "first",
                  label: t("linksFirst"),
                  description: t("linksFirstDesc"),
                },
              ]}
            />
            {links === "first" ? (
              <Field
                label={t("linkLabel")}
                required
                help={t("linkHelp")}
                error={show(urlProblem, "link")}
              >
                <Input
                  mono
                  name="meetingUrl"
                  placeholder="https://zoom.us/j/…"
                  autoComplete="off"
                  spellCheck={false}
                  value={firstUrl}
                  onChange={(e) => setFirstUrl(e.target.value)}
                />
              </Field>
            ) : null}
            <Alert tone="info">
              <p>{t("linksNote")}</p>
            </Alert>
          </section>

          <div className="flex items-center gap-3">
            <Button variant="ghost" href={`${base}/sessions`} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              loading={saving}
              loadingLabel={t("saving")}
              disabled={count === 0}
            >
              {t("submit", { count })}
            </Button>
          </div>
        </div>

        <aside
          className="mds-card flex flex-col gap-3 lg:sticky lg:top-6"
          aria-labelledby="p-prev"
          data-testid="plan-preview"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="p-prev" className="mds-h2">
              {t("previewTitle")}
            </h2>
            <span className="mds-badge mds-badge--secondary">
              {t("count", { count: summary.count })}
            </span>
          </div>
          <p className="mds-caption">{t("previewNote")}</p>
          {previewFailed ? (
            <p className="mds-error" role="alert">
              {t("previewFailed")}
            </p>
          ) : null}
          <ul className="flex flex-col divide-y">
            {(preview ?? []).map((s, i) => (
              <li key={`${s.localDate}-${i}`} className="flex flex-col py-2">
                <span>
                  {formatInstant(
                    format,
                    new Date(s.scheduledAt),
                    form.timeZone,
                    "full"
                  )}
                </span>
                <span className="mds-caption">
                  {t("previewRow", {
                    week: s.weekNumber,
                    minutes: form.duration,
                    link: t(
                      i === 0 && links === "first" ? "linkSet" : "linkEmpty"
                    ),
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mds-caption">
            {t("previewFoot", {
              zone:
                form.timeZone === "Europe/Istanbul"
                  ? t("zoneIstanbul")
                  : form.timeZone,
            })}
          </p>
        </aside>
      </div>
    </form>
  );
}
