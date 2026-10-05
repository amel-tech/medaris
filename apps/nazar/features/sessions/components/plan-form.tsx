"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { DEFAULT_TIME_ZONE, listTimeZones, timeZoneCity } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import type { Messages } from "~/lib/i18n/messages";
import { createSessions, previewSessions } from "../actions";
import {
  type PlanForm as PlanFields,
  planErrors,
  planPattern,
  planRequest,
  planSummary,
  sendableLink,
  sessionErrorKey,
  sessionsHref,
  WEEKDAYS,
  weekdayName,
  whenLabel,
} from "../sessions";

type Links = "empty" | "first";
type Preview = Array<{
  scheduledAt: string;
  localDate: string;
  weekNumber: number;
}>;

/** How long the preview waits after the last key before it asks the API. */
const PREVIEW_DELAY_MS = 250;

/**
 * "Celse planla": one session, or a weekly repeat, made in one go. The preview
 * beside the form is tedrisat's own expansion of the pattern (the same call
 * that saves it), so it shows the week each session lands in and nothing is
 * written until "N celse oluştur". Every session has a link of its own, so the
 * links stay empty or go to the first session only. The times are typed on the
 * viewer's clock unless another zone is chosen.
 */
export function PlanForm({
  courseId,
  courseTitle,
  locale,
  timeZone,
}: {
  courseId: string;
  courseTitle: string;
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [saving, startSaving] = useTransition();

  const [form, setForm] = useState<PlanFields>({
    mode: "weekly",
    weekdays: [],
    startTime: "21:00",
    duration: "60",
    timeZone,
    startDate: "",
    endMode: "date",
    endDate: "",
    count: "8",
  });
  const [title, setTitle] = useState(t("SessionPlan.defaultTitle"));
  const [links, setLinks] = useState<Links>("empty");
  const [firstUrl, setFirstUrl] = useState("");
  const [sent, setSent] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const set = <K extends keyof PlanFields>(key: K, value: PlanFields[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const zones = useMemo(() => listTimeZones(form.timeZone), [form.timeZone]);
  const problems = planErrors(form);
  const pattern = planPattern(form);
  const zoneName = (zone: string) =>
    zone === DEFAULT_TIME_ZONE
      ? t("SessionPlan.zoneIstanbul")
      : timeZoneCity(zone);

  // The preview follows the fields, a moment after the last key.
  const patternKey = pattern ? JSON.stringify(pattern) : null;
  useEffect(() => {
    if (!pattern) {
      setPreview(null);
      setPreviewFailed(false);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const result = await previewSessions(courseId, pattern);
      if (!live) return;
      if (result.success) {
        setPreview(result.data.sessions);
        setPreviewFailed(false);
      } else {
        setPreview(null);
        setPreviewFailed(true);
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [patternKey, courseId]);

  const summary = planSummary(preview ?? []);
  const titleProblem = title.trim().length === 0;
  const firstLink = links === "first" ? sendableLink(firstUrl) : null;
  const urlProblem = links === "first" && firstLink === null;
  const hasProblem =
    Object.keys(problems).length > 0 || titleProblem || urlProblem;
  const count = preview?.length ?? 0;

  const show = (flag: boolean, key: string) =>
    sent && flag ? t(`SessionPlan.errors.${key}` as never) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (hasProblem || !pattern) {
      setSent(true);
      return;
    }
    startSaving(async () => {
      const result = await createSessions(
        courseId,
        planRequest(pattern, form, title, firstLink)
      );
      if (!result.success) {
        notify({
          tone: "error",
          title: t("SessionPlan.failed"),
          description: words(sessionErrorKey(result.code)),
        });
        return;
      }
      notify({
        title: t("SessionPlan.created"),
        description: t("SessionPlan.createdBody", { count: result.data.count }),
      });
      router.push(sessionsHref(courseId));
    });
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={submit}
      noValidate
      data-testid="session-plan"
    >
      <header className="flex max-inline-measure flex-col gap-3">
        <Breadcrumb
          label={t("SessionPlan.breadcrumbLabel")}
          items={[
            {
              label: t("SessionPlan.breadcrumbRoot"),
              href: sessionsHref(courseId),
            },
            t("SessionPlan.breadcrumbCurrent"),
          ]}
        />
        <h1 className="mds-h1">{t("SessionPlan.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {t("SessionPlan.intro", { name: courseTitle })}
        </p>
        <p className="mds-caption">* {t("SessionPlan.requiredNote")}</p>
      </header>

      <ChoiceChips
        legend={t("SessionPlan.modeLegend")}
        legendVisible
        name="mode"
        value={form.mode}
        onChange={(value) => value && set("mode", value as PlanFields["mode"])}
        options={[
          { value: "single", label: t("SessionPlan.modeSingle") },
          { value: "weekly", label: t("SessionPlan.modeWeekly") },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-inline-0 flex-col gap-6">
          <section
            className="mds-card flex flex-col gap-4"
            aria-labelledby="plan-repeat"
          >
            <h2 id="plan-repeat" className="mds-h2">
              {t(
                form.mode === "weekly"
                  ? "SessionPlan.repeatTitle"
                  : "SessionPlan.singleTitle"
              )}
            </h2>
            {form.mode === "weekly" ? (
              <div className="flex flex-col gap-2">
                <ChoiceChips
                  multiple
                  legend={`${t("SessionPlan.daysLegend")} *`}
                  legendVisible
                  name="weekdays"
                  value={form.weekdays.map(String)}
                  onChange={(value) => set("weekdays", value.map(Number))}
                  options={WEEKDAYS.map((day) => ({
                    value: String(day),
                    label: weekdayName(locale, day, "short"),
                  }))}
                />
                {sent && problems.weekdays ? (
                  <p className="mds-error" role="alert">
                    {t("SessionPlan.errors.weekdays")}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("SessionPlan.startTimeLabel")}
                required
                error={show(Boolean(problems.startTime), "startTime")}
              >
                <Input
                  type="time"
                  name="startTime"
                  value={form.startTime}
                  onChange={(event) => set("startTime", event.target.value)}
                />
              </Field>
              <Field
                label={t("SessionPlan.durationLabel")}
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
                  trailing={t("SessionPlan.durationUnit")}
                  onChange={(event) => set("duration", event.target.value)}
                />
              </Field>
            </div>
            <Field
              label={t("SessionPlan.zoneLabel")}
              help={t("SessionPlan.zoneHelp")}
            >
              <Select
                name="timeZone"
                value={form.timeZone}
                onChange={(value) => value && set("timeZone", value)}
                options={zones.map((zone) => ({
                  value: zone,
                  label: zoneName(zone),
                }))}
              />
            </Field>
            <Field
              label={t(
                form.mode === "weekly"
                  ? "SessionPlan.startDateLabel"
                  : "SessionPlan.dateLabel"
              )}
              required
              error={show(Boolean(problems.startDate), "startDate")}
            >
              <Input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={(event) => set("startDate", event.target.value)}
              />
            </Field>
            {form.mode === "weekly" ? (
              <>
                <RadioGroup
                  legend={t("SessionPlan.endLegend")}
                  name="endMode"
                  value={form.endMode}
                  onChange={(value) =>
                    set("endMode", value as PlanFields["endMode"])
                  }
                  options={[
                    { value: "date", label: t("SessionPlan.endDate") },
                    { value: "count", label: t("SessionPlan.endCount") },
                  ]}
                />
                {form.endMode === "date" ? (
                  <Field
                    label={t("SessionPlan.endDateLabel")}
                    required
                    help={t("SessionPlan.endDateHelp")}
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
                      onChange={(event) => set("endDate", event.target.value)}
                    />
                  </Field>
                ) : (
                  <Field
                    label={t("SessionPlan.countLabel")}
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
                      onChange={(event) => set("count", event.target.value)}
                    />
                  </Field>
                )}
              </>
            ) : null}
          </section>

          <section
            className="mds-card flex flex-col gap-4"
            aria-labelledby="plan-sessions"
          >
            <h2 id="plan-sessions" className="mds-h2">
              {t("SessionPlan.sessionsTitle")}
            </h2>
            <Field
              label={t("SessionPlan.titleLabel")}
              required
              help={t("SessionPlan.titleHelp")}
              error={show(titleProblem, "title")}
            >
              <Input
                name="title"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <RadioGroup
              legend={t("SessionPlan.linksLegend")}
              name="links"
              bordered
              value={links}
              onChange={(value) => setLinks(value as Links)}
              options={[
                {
                  value: "empty",
                  label: t("SessionPlan.linksEmpty"),
                  description: t("SessionPlan.linksEmptyDesc"),
                },
                {
                  value: "first",
                  label: t("SessionPlan.linksFirst"),
                  description: t("SessionPlan.linksFirstDesc"),
                },
              ]}
            />
            {links === "first" ? (
              <Field
                label={t("SessionPlan.linkLabel")}
                required
                help={t("SessionPlan.linkHelp")}
                error={show(urlProblem, "link")}
              >
                <Input
                  mono
                  name="meetingUrl"
                  placeholder="https://zoom.us/j/…"
                  autoComplete="off"
                  spellCheck={false}
                  value={firstUrl}
                  onChange={(event) => setFirstUrl(event.target.value)}
                />
              </Field>
            ) : null}
            <Alert tone="info">
              <p>{t("SessionPlan.linksNote")}</p>
            </Alert>
          </section>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              href={sessionsHref(courseId)}
              disabled={saving}
            >
              {t("SessionPlan.cancel")}
            </Button>
            <Button
              type="submit"
              loading={saving}
              loadingLabel={t("SessionPlan.saving")}
              disabled={count === 0}
            >
              {t("SessionPlan.submit", { count })}
            </Button>
          </div>
        </div>

        <aside
          className="mds-card flex flex-col gap-3 lg:sticky lg:top-6"
          aria-labelledby="plan-preview"
          data-testid="plan-preview"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="plan-preview" className="mds-h2">
              {t("SessionPlan.previewTitle")}
            </h2>
            <span className="mds-badge mds-badge--secondary">
              {t("SessionPlan.count", { count: summary.count })}
            </span>
          </div>
          <p className="mds-caption">{t("SessionPlan.previewNote")}</p>
          {previewFailed ? (
            <p className="mds-error" role="alert">
              {t("SessionPlan.previewFailed")}
            </p>
          ) : null}
          <ul className="flex flex-col divide-y">
            {(preview ?? []).map((session, index) => (
              <li
                key={`${session.localDate}-${session.scheduledAt}`}
                className="flex flex-col py-2"
              >
                <span>
                  {whenLabel(
                    new Date(session.scheduledAt),
                    { locale, timeZone: form.timeZone },
                    "full"
                  )}
                </span>
                <span className="mds-caption">
                  {t("SessionPlan.previewRow", {
                    week: session.weekNumber,
                    minutes: form.duration,
                    link: t(
                      index === 0 && links === "first"
                        ? "SessionPlan.linkSet"
                        : "SessionPlan.linkEmpty"
                    ),
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mds-caption">
            {t("SessionPlan.previewFoot", { zone: zoneName(form.timeZone) })}
          </p>
        </aside>
      </div>
    </form>
  );
}
