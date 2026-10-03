"use client";

import type { KoskResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { DEFAULT_TIME_ZONE, listTimeZones, timeZoneCity } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";
import {
  createCourseSessions,
  createKoskCourse,
} from "~/features/kosks/actions/courses";
import {
  COVER_TONES,
  koskCase,
  TONE_HUE,
} from "~/features/kosks/admin-present";
import { acceptCourseRequest } from "~/features/platform-admin/actions";
import { formatDay, weekdayName } from "../format";
import {
  arabicOfCoverLabel,
  COVER_LABELS,
  courseErrorKey,
  coursePattern,
  patternDates,
  scheduleErrors,
  type TeamState,
  teamPayload,
  WEEKDAYS,
} from "../present";
import { TeamPicker } from "./team-picker";

/**
 * One toast id for the whole "Dersi aç" action (MDRS-214): a retry that
 * succeeds replaces the earlier "Ders açılamadı" instead of leaving it on top
 * of Dersler, where it reads as "the course was not opened".
 */
const TOAST_ID = "courses:create";

interface Props {
  kosk: KoskResponse;
  /** A medrese's course request (nizam/39 "Kabul et"): it names the course and is accepted with it. */
  request?: { id: string; title: string };
}

/**
 * Ders aç (nizam 32): a köşk nazımı opens the köşk's own (non-medrese) course.
 * The form has the course, its müderris team, the schedule and, apart, the
 * settings; the schedule is lived as a summary line ("8 celse planlanacak …")
 * that follows the fields. "Dersi aç" creates the course and then its sessions
 * in one request chain; with a field wrong it sends nothing and says which.
 */
export function CourseCreateForm({ kosk, request }: Props) {
  const t = useTranslations("nizam.CourseCreate");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();

  const [title, setTitle] = useState(request?.title ?? "");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<(typeof COVER_TONES)[number]>("bordo");
  const [label, setLabel] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamState>({
    members: [],
    imamUserId: null,
  });
  const [startDate, setStartDate] = useState("");
  const [weeks, setWeeks] = useState("8");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("21:00");
  const [duration, setDuration] = useState("60");
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [isClosed, setIsClosed] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [publish, setPublish] = useState<"draft" | "publish">("draft");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const zones = useMemo(() => listTimeZones(timeZone), [timeZone]);
  const base = `/${locale}/kosks/${kosk.id}`;

  const schedule = {
    startDate,
    weeks,
    weekdays,
    startTime,
    duration,
    timeZone,
  };
  const scheduleProblems = scheduleErrors(schedule);
  const pattern = coursePattern(schedule);
  const dates = pattern ? patternDates(pattern) : [];
  const first = dates.at(0);
  const last = dates.at(-1);
  const members = team.members.length;
  const teamProblem =
    members === 0 ? "team" : teamPayload(team, 0) === null ? "imam" : null;
  const titleProblem = title.trim().length < 2;
  const hasProblem =
    titleProblem ||
    teamProblem !== null ||
    Object.keys(scheduleProblems).length > 0;

  const show = (problem: boolean, key: string) =>
    sent && problem ? t(`errors.${key}` as never) : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = teamPayload(team, 0);
    if (hasProblem || !pattern || !payload) {
      setSent(true);
      return;
    }
    setSaving(true);
    const created = await createKoskCourse(kosk.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      coverHue: TONE_HUE[tone],
      coverLabel: label ?? undefined,
      isClosed,
      requiresApproval,
      status: publish === "publish" ? "PUBLISHED" : "DRAFT",
      timeZone,
      muderris: payload.muderris,
      weeks: [],
      resources: [],
    });
    if (!created.success) {
      setSaving(false);
      toast.error(t("failed"), {
        id: TOAST_ID,
        description: t(
          `errors.api.${courseErrorKey(created.errorBody)}` as never
        ),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    // The request is answered by the course opened from it; a request already
    // answered elsewhere does not undo a course that now exists.
    if (request) await acceptCourseRequest(request.id, created.data.id);
    const sessions = await createCourseSessions(kosk.id, created.data.id, {
      ...pattern,
      title: title.trim(),
      durationMinutes: Number(duration),
    });
    setSaving(false);
    if (!sessions.success) {
      toast.error(t("sessionsFailed"), {
        id: TOAST_ID,
        description: t("sessionsFailedBody", { name: title.trim() }),
        duration: Number.POSITIVE_INFINITY,
      });
      router.push(`${base}/courses/${created.data.id}/sessions/new`);
      return;
    }
    toast.success(t("created"), {
      id: TOAST_ID,
      description: t("createdBody", { name: title.trim() }),
    });
    router.push(`${base}/dersler`);
  };

  const dayList = [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => weekdayName(format, d, "long"))
    .join(", ");

  return (
    <form
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      onSubmit={submit}
      noValidate
      data-testid="course-create"
    >
      <header className="flex max-w-[48rem] flex-col gap-3">
        <Breadcrumb
          label={t("breadcrumbLabel")}
          items={[
            { label: t("breadcrumbRoot"), href: `${base}/dersler` },
            t("breadcrumbCurrent"),
          ]}
        />
        <h1 className="mds-h1">{t("title")}</h1>
        <p>
          {t("intro", {
            koskGenitive: koskCase(kosk.name, locale, "genitive"),
          })}
        </p>
        <p className="mds-caption">* {t("requiredNote")}</p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <section className="flex flex-col gap-4" aria-labelledby="sec-course">
            <h2 id="sec-course" className="mds-h2">
              {t("courseSection")}
            </h2>
            <Field
              label={t("nameLabel")}
              required
              help={t("nameHelp")}
              error={show(titleProblem, "title")}
            >
              <Input
                name="title"
                value={title}
                maxLength={200}
                disabled={saving}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label={t("descLabel")} help={t("descHelp")}>
              <Textarea
                name="description"
                rows={4}
                value={description}
                maxLength={2000}
                disabled={saving}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex flex-col gap-2">
                <CoverPattern
                  tone={tone}
                  size="lg"
                  label={arabicOfCoverLabel(label) ?? title}
                  labelLang="ar"
                />
                <span className="mds-caption">{t("previewLabel")}</span>
              </div>
              <div className="flex min-w-[16rem] flex-1 flex-col gap-4">
                <RadioGroup
                  legend={t("toneLegend")}
                  name="tone"
                  className="flex-row flex-wrap gap-x-5 [&>.mds-label]:basis-full"
                  value={tone}
                  onChange={(v) => setTone(v as typeof tone)}
                  options={COVER_TONES.map((value) => ({
                    value,
                    label: (
                      <span className="inline-flex items-center gap-2">
                        <CoverPattern tone={value} size="xs" />
                        {t(`tones.${value}`)}
                      </span>
                    ),
                  }))}
                />
                <Field label={t("labelLabel")} help={t("labelHelp")}>
                  <Select
                    name="coverLabel"
                    value={label}
                    placeholder={t("labelPlaceholder")}
                    onChange={setLabel}
                    options={COVER_LABELS.map((l) => ({
                      value: l.value,
                      label: l.value,
                    }))}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section
            className="flex flex-col gap-4"
            aria-labelledby="sec-muderris"
          >
            <h2 id="sec-muderris" className="mds-h2">
              {t("muderrisSection")}
            </h2>
            <TeamPicker
              name="createImam"
              value={team}
              onChange={setTeam}
              disabled={saving}
              error={show(teamProblem === "team", "team")}
            />
            {sent && teamProblem === "imam" ? (
              <p className="mds-error" role="alert">
                {t("errors.imam")}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="sec-time">
            <h2 id="sec-time" className="mds-h2">
              {t("timeSection")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("startDateLabel")}
                required
                help={t("startDateHelp")}
                error={show(Boolean(scheduleProblems.startDate), "startDate")}
              >
                <Input
                  type="date"
                  name="startDate"
                  value={startDate}
                  disabled={saving}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field
                label={t("weeksLabel")}
                required
                help={t("weeksHelp")}
                error={show(Boolean(scheduleProblems.weeks), "weeks")}
              >
                <Input
                  type="number"
                  name="weeks"
                  min={1}
                  max={52}
                  inputMode="numeric"
                  value={weeks}
                  trailing={t("weeksUnit")}
                  disabled={saving}
                  onChange={(e) => setWeeks(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <ChoiceChips
                multiple
                legend={`${t("daysLegend")} *`}
                legendVisible
                name="weekdays"
                value={weekdays.map(String)}
                onChange={(v) => setWeekdays(v.map(Number))}
                options={WEEKDAYS.map((d) => ({
                  value: String(d),
                  label: weekdayName(format, d, "short"),
                }))}
              />
              {sent && scheduleProblems.weekdays ? (
                <p className="mds-error" role="alert">
                  {t("errors.weekdays")}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("startTimeLabel")}
                required
                error={show(Boolean(scheduleProblems.startTime), "startTime")}
              >
                <Input
                  type="time"
                  name="startTime"
                  value={startTime}
                  disabled={saving}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
              <Field
                label={t("durationLabel")}
                required
                error={show(Boolean(scheduleProblems.duration), "duration")}
              >
                <Input
                  type="number"
                  name="duration"
                  min={1}
                  max={1440}
                  inputMode="numeric"
                  value={duration}
                  trailing={t("durationUnit")}
                  disabled={saving}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </Field>
            </div>
            <Field label={t("zoneLabel")} help={t("zoneHelp")}>
              <Select
                name="timeZone"
                value={timeZone}
                onChange={(v) => v && setTimeZone(v)}
                options={zones.map((zone) => ({
                  value: zone,
                  label:
                    zone === DEFAULT_TIME_ZONE
                      ? t("zoneIstanbul")
                      : timeZoneCity(zone),
                }))}
              />
            </Field>
            <Alert
              tone="info"
              title={t("summaryTitle", { count: dates.length })}
              data-testid="schedule-summary"
            >
              {first === undefined || last === undefined ? (
                <p>{t("summaryEmpty")}</p>
              ) : (
                <p>
                  {t("summaryBody", {
                    from: formatDay(format, first, false),
                    to: formatDay(format, last, true),
                    days: dayList,
                    time: startTime,
                    minutes: duration,
                  })}{" "}
                  {t("summaryLink")}
                </p>
              )}
            </Alert>
          </section>
        </div>

        <aside
          className="mds-card flex flex-col gap-4 lg:sticky lg:top-6"
          aria-labelledby="sec-settings"
        >
          <h2 id="sec-settings" className="mds-h2">
            {t("settingsTitle")}
          </h2>
          <Checkbox
            bordered
            icon={<Icon name="lock" size="sm" />}
            label={t("closedLabel")}
            description={t("closedDesc")}
            checked={isClosed}
            disabled={saving}
            onCheckedChange={(checked) => setIsClosed(checked === true)}
            name="isClosed"
          />
          <Checkbox
            bordered
            icon={<Icon name="users" size="sm" />}
            label={t("approvalLabel")}
            description={t(
              kosk.alwaysRequireApproval ? "approvalFixed" : "approvalDesc"
            )}
            checked={kosk.alwaysRequireApproval || requiresApproval}
            disabled={saving || kosk.alwaysRequireApproval}
            onCheckedChange={(checked) => setRequiresApproval(checked === true)}
            name="requiresApproval"
          />
          <RadioGroup
            legend={t("visibilityLegend")}
            name="visibility"
            bordered
            value={publish}
            onChange={(v) => setPublish(v as typeof publish)}
            options={[
              {
                value: "draft",
                label: t("draftLabel"),
                description: t("draftDesc"),
              },
              {
                value: "publish",
                label: t("publishLabel"),
                description: t("publishDesc"),
              },
            ]}
          />
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" href={`${base}/dersler`} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={saving} loadingLabel={t("saving")}>
              {t("submit")}
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}
