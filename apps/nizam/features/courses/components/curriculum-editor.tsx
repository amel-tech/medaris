"use client";

import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { WeekAccordion, Weeks } from "@medaris/ui/mds/week-accordion";
import {
  normalizeMeetingUrl,
  resolveMeetingPlatform,
  timeZoneCity,
  toZonedDatetimeLocal,
} from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { COVER_TONES, toneOfHue } from "~/features/kosks/admin-present";
import { saveCurriculum } from "../actions";
import { formatDay } from "../format";
import { curriculumPayload } from "../payload";
import {
  type CurriculumError,
  type CurriculumProblem,
  copyWeek,
  courseErrorKey,
  curriculumDirty,
  curriculumErrors,
  type LessonDraft,
  linkProblem,
  type ResourceDraft,
  resourceDraftsOf,
  type WeekDraft,
  weekDraftsOf,
  weekFacts,
} from "../present";
import { ResourcesEditor } from "./resources-editor";

interface Props {
  kosk: { id: string; name: string };
  course: CourseDetailResponse;
}

const emptyLesson = (): LessonDraft => ({
  title: "",
  type: "LIVE",
  date: "",
  time: "21:00",
  duration: "60",
  meetingUrl: "",
  kaynak: "",
  agenda: [],
  isPreview: false,
  cancelledAt: null,
  cancelReason: null,
  scheduledAtIso: null,
  makeup: false,
});

/**
 * Müfredat (nizam 54): the course's details, its weeks and its sessions in one
 * form. Nothing is written until "Kaydet", which sends the whole course (PUT)
 * with the version it was loaded with; a week or a session taken out of the
 * form is hidden by that save, never deleted. A cancelled session is shown as
 * information. While the form differs from the saved course a strip says so,
 * with "Vazgeç" to put the saved values back.
 */
export function CurriculumEditor({ kosk, course }: Props) {
  const t = useTranslations("nizam.Curriculum");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [saved, setSaved] = useState(course);
  const initial = useMemo(
    () => ({
      title: saved.title,
      description: saved.description ?? "",
      tone: toneOfHue(saved.coverHue) as (typeof COVER_TONES)[number],
      weeks: weekDraftsOf(saved),
      resources: resourceDraftsOf(saved),
    }),
    [saved]
  );
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [tone, setTone] = useState(initial.tone);
  const [weeks, setWeeks] = useState<WeekDraft[]>(initial.weeks);
  const [resources, setResources] = useState<ResourceDraft[]>(
    initial.resources
  );
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = { title, description, tone, weeks, resources };
  const dirty = curriculumDirty(current, initial);
  const errors = curriculumErrors(title, weeks, resources);
  const has = (kind: CurriculumProblem, wi?: number, li?: number) =>
    errors.some(
      (e: CurriculumError) =>
        e.kind === kind && e.weekIndex === wi && e.lessonIndex === li
    );
  const shown = (kind: CurriculumProblem, wi?: number, li?: number) =>
    sent && has(kind, wi, li);
  const shownResource = (kind: CurriculumProblem, ri: number) =>
    sent && errors.some((e) => e.kind === kind && e.resourceIndex === ri);

  const base = `/${locale}/kosks/${kosk.id}`;
  const courseBase = `${base}/courses/${saved.id}`;
  const zone = saved.timeZone;
  const sessionCount = weeks.reduce(
    (n, w) => n + w.lessons.filter((l) => !l.cancelledAt).length,
    0
  );

  const reset = () => {
    setTitle(initial.title);
    setDescription(initial.description);
    setTone(initial.tone);
    setWeeks(initial.weeks);
    setResources(initial.resources);
    setSent(false);
  };

  const patchWeek = (wi: number, change: Partial<WeekDraft>) =>
    setWeeks((all) => all.map((w, i) => (i === wi ? { ...w, ...change } : w)));
  const patchLesson = (wi: number, li: number, change: Partial<LessonDraft>) =>
    setWeeks((all) =>
      all.map((w, i) =>
        i === wi
          ? {
              ...w,
              lessons: w.lessons.map((l, j) =>
                j === li ? { ...l, ...change } : l
              ),
            }
          : w
      )
    );

  const nextNumber = () => Math.max(0, ...weeks.map((w) => w.weekNumber)) + 1;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (errors.length > 0) {
      setSent(true);
      return;
    }
    setSaving(true);
    const result = await saveCurriculum(
      kosk.id,
      saved.id,
      curriculumPayload(saved, { title, description, tone, weeks, resources })
    );
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: t(
          `errors.api.${courseErrorKey(result.errorBody)}` as never
        ),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    setSaved(result.data);
    setWeeks(weekDraftsOf(result.data));
    setResources(resourceDraftsOf(result.data));
    setTitle(result.data.title);
    setDescription(result.data.description ?? "");
    setSent(false);
    toast.success(t("saved"), {
      description: t("savedBody", { name: result.data.title }),
    });
    startTransition(() => router.refresh());
  };

  // Today in the course's zone: the sessions' dates are written in it, and
  // the UTC day is a day behind in Istanbul from 00:00 to 03:00.
  const nowDay = toZonedDatetimeLocal(new Date(), zone).slice(0, 10);

  return (
    <form
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      onSubmit={submit}
      noValidate
      data-testid="curriculum"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[48rem] flex-col gap-3">
          <Breadcrumb
            label={t("breadcrumbLabel")}
            items={[
              { label: t("breadcrumbRoot"), href: `${base}/dersler` },
              { label: saved.title, href: courseBase },
              t("breadcrumbCurrent"),
            ]}
          />
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro", { name: saved.title })}</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty ? (
            <output className="mds-caption" data-testid="dirty">
              {t("dirty")}
            </output>
          ) : null}
          <Button
            variant="ghost"
            type="button"
            disabled={!dirty || saving}
            onClick={reset}
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
      </header>

      <nav className="flex gap-4" aria-label={t("subnavLabel")}>
        <a
          className="mds-link"
          aria-current="page"
          href={`${courseBase}/curriculum`}
        >
          {t("title")}
        </a>
        <a className="mds-link" href={`${courseBase}/sessions`}>
          {t("sessionsLink")}
        </a>
        <a className="mds-link" href={`${courseBase}/ayarlar`}>
          {t("settingsLink")}
        </a>
      </nav>

      <section
        className="mds-card flex flex-col gap-4"
        aria-labelledby="c-info"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="c-info" className="mds-h2">
            {t("infoTitle")}
          </h2>
          <span className="mds-caption">* {t("requiredNote")}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={t("nameLabel")}
            required
            help={t("nameHelp")}
            error={shown("title") ? t("errors.title") : undefined}
          >
            <Input
              name="title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
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
        </div>
        <Field label={t("descLabel")} help={t("descHelp")}>
          <Textarea
            name="description"
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </section>

      <ResourcesEditor
        resources={resources}
        onChange={setResources}
        shown={shownResource}
      />

      <section className="flex flex-col gap-4" aria-labelledby="c-weeks">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="c-weeks" className="mds-h2">
              {t("weeksTitle")}
            </h2>
            <p className="mds-caption">
              {t("weeksSummary", {
                weeks: weeks.length,
                sessions: sessionCount,
                zone: t(
                  zone === "Europe/Istanbul" ? "zoneIstanbul" : "zoneOther",
                  { zone: timeZoneCity(zone) }
                ),
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" href={`${courseBase}/ayarlar`}>
              {t("changeZone")}
            </Button>
            <Button
              variant="secondary"
              href={`${courseBase}/sessions/new`}
              iconLeft={<Icon name="repeat" size="sm" />}
            >
              {t("generate")}
            </Button>
            <Button
              variant="outline"
              type="button"
              iconLeft={<Icon name="plus" size="sm" />}
              onClick={() =>
                setWeeks((all) => [
                  ...all,
                  {
                    weekNumber: nextNumber(),
                    title: "",
                    summary: "",
                    lessons: [],
                  },
                ])
              }
            >
              {t("addWeek")}
            </Button>
          </div>
        </div>
        {dirty && sessionCount > 0 ? (
          <p className="mds-caption">{t("generateNote")}</p>
        ) : null}

        <Weeks
          defaultOpen={weeks
            .filter((w) => {
              const f = weekFacts(w);
              return f.to !== null && f.from !== null && f.to >= nowDay;
            })
            .slice(0, 1)
            .map((w) => w.weekNumber)}
        >
          {weeks.map((week, wi) => {
            const facts = weekFacts(week);
            const done = facts.to !== null && facts.to < nowDay;
            const active =
              facts.from !== null &&
              facts.to !== null &&
              facts.from <= nowDay &&
              nowDay <= facts.to;
            return (
              <WeekAccordion
                key={week.id ?? `new-${week.weekNumber}-${wi}`}
                week={week.weekNumber}
                title={week.title || t("untitledWeek")}
                state={active ? "active" : done ? "done" : "default"}
                weekLabel={t.raw("weekLabel") as string}
                activeLabel={t("weekActive")}
                doneLabel={t("weekDone")}
                emptyLabel={t("weekEmpty")}
                locale={locale}
                meta={
                  facts.from && facts.to
                    ? t("weekMeta", {
                        from: formatDay(format, facts.from, false),
                        to: formatDay(format, facts.to, false),
                        sessions: facts.sessions,
                        minutes: facts.minutes,
                      })
                    : t("weekMetaNoDates", { sessions: facts.sessions })
                }
              >
                <li className="flex flex-col gap-4 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label={t("weekTitleLabel")}
                      required
                      error={
                        shown("weekTitle", wi)
                          ? t("errors.weekTitle")
                          : undefined
                      }
                    >
                      <Input
                        name={`week-${wi}-title`}
                        value={week.title}
                        maxLength={200}
                        onChange={(e) =>
                          patchWeek(wi, { title: e.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label={t("weekSummaryLabel")}
                      help={t("weekSummaryHelp")}
                    >
                      <Textarea
                        name={`week-${wi}-summary`}
                        rows={3}
                        maxLength={500}
                        value={week.summary}
                        onChange={(e) =>
                          patchWeek(wi, { summary: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </li>
                {week.lessons.map((lesson, li) => {
                  const url = normalizeMeetingUrl(lesson.meetingUrl);
                  const platform = resolveMeetingPlatform(url);
                  const problem = linkProblem(lesson.meetingUrl);
                  const at = lesson.date
                    ? new Date(`${lesson.date}T12:00:00Z`)
                    : null;
                  return (
                    <li
                      key={lesson.id ?? `new-${li}`}
                      className="mds-card flex flex-col gap-3"
                      data-testid={`lesson-${wi}-${li}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="mds-label">
                          {t("lessonHeading", {
                            n: li + 1,
                            when: at
                              ? `${format.dateTime(at, {
                                  day: "numeric",
                                  month: "short",
                                  weekday: "short",
                                  timeZone: "UTC",
                                })} ${lesson.time}`
                              : "",
                          })}
                        </h3>
                        <span className="flex items-center gap-2">
                          {lesson.cancelledAt ? (
                            <Badge variant="outline">{t("cancelled")}</Badge>
                          ) : !url ? (
                            <Badge
                              variant="warning"
                              icon={<Icon name="link" size="sm" />}
                            >
                              {t("linkMissing")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">{t("scheduled")}</Badge>
                          )}
                          {lesson.cancelledAt ? null : (
                            <Button
                              variant="ghost"
                              size="small"
                              type="button"
                              iconLeft={<Icon name="eye" size="sm" />}
                              onClick={() =>
                                patchWeek(wi, {
                                  lessons: week.lessons.filter(
                                    (_, j) => j !== li
                                  ),
                                })
                              }
                            >
                              {t("hide")}
                            </Button>
                          )}
                        </span>
                      </div>
                      {lesson.cancelledAt ? (
                        <div className="flex flex-col gap-1">
                          <p>
                            <bdi>{lesson.title}</bdi>
                            {lesson.duration
                              ? ` · ${t("minutes", { minutes: lesson.duration })}`
                              : ""}
                          </p>
                          <p className="mds-caption">
                            {t("cancelledNote", {
                              when: format.dateTime(
                                new Date(lesson.cancelledAt),
                                {
                                  day: "numeric",
                                  month: "long",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hourCycle: "h23",
                                  timeZone: zone,
                                }
                              ),
                            })}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field
                              label={t("lessonTitleLabel")}
                              required
                              help={
                                lesson.makeup
                                  ? t("makeupNote", { n: week.weekNumber })
                                  : undefined
                              }
                              error={
                                shown("lessonTitle", wi, li)
                                  ? t("errors.lessonTitle")
                                  : undefined
                              }
                            >
                              <Input
                                name={`lesson-${wi}-${li}-title`}
                                value={lesson.title}
                                maxLength={200}
                                onChange={(e) =>
                                  patchLesson(wi, li, { title: e.target.value })
                                }
                              />
                            </Field>
                            {/* MDRS-279: the session's own source line, the
                                tedrisat column's 120 characters at most. */}
                            <Field
                              label={t("kaynakLabel")}
                              help={t("kaynakHelp")}
                            >
                              <Input
                                name={`lesson-${wi}-${li}-kaynak`}
                                value={lesson.kaynak}
                                maxLength={120}
                                dir="auto"
                                onChange={(e) =>
                                  patchLesson(wi, li, {
                                    kaynak: e.target.value,
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <Field
                              label={t("dateLabel")}
                              required
                              error={
                                shown("lessonDate", wi, li)
                                  ? t("errors.lessonDate")
                                  : undefined
                              }
                            >
                              <Input
                                type="date"
                                name={`lesson-${wi}-${li}-date`}
                                value={lesson.date}
                                onChange={(e) =>
                                  patchLesson(wi, li, { date: e.target.value })
                                }
                              />
                            </Field>
                            <Field
                              label={t("timeLabel")}
                              required
                              error={
                                shown("lessonTime", wi, li)
                                  ? t("errors.lessonTime")
                                  : undefined
                              }
                            >
                              <Input
                                type="time"
                                name={`lesson-${wi}-${li}-time`}
                                value={lesson.time}
                                onChange={(e) =>
                                  patchLesson(wi, li, { time: e.target.value })
                                }
                              />
                            </Field>
                            <Field
                              label={t("durationLabel")}
                              required
                              error={
                                shown("lessonDuration", wi, li)
                                  ? t("errors.lessonDuration")
                                  : undefined
                              }
                            >
                              <Input
                                type="number"
                                min={1}
                                max={1440}
                                inputMode="numeric"
                                name={`lesson-${wi}-${li}-duration`}
                                value={lesson.duration}
                                trailing={t("durationUnit")}
                                onChange={(e) =>
                                  patchLesson(wi, li, {
                                    duration: e.target.value,
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <Field
                            label={
                              <span className="flex w-full items-center justify-between gap-2">
                                {t("linkLabel")}
                                {url && platform.id !== "unknown" ? (
                                  <PlatformChip
                                    platform={platform.id}
                                    detected
                                    detectedLabel={t("detected")}
                                  />
                                ) : null}
                              </span>
                            }
                            help={t(url ? "linkHelpFilled" : "linkHelp")}
                            error={
                              shown("link", wi, li) && problem
                                ? t("errors.link")
                                : undefined
                            }
                          >
                            <Input
                              mono
                              name={`lesson-${wi}-${li}-url`}
                              placeholder="https://zoom.us/j/…"
                              autoComplete="off"
                              spellCheck={false}
                              value={lesson.meetingUrl}
                              onChange={(e) =>
                                patchLesson(wi, li, {
                                  meetingUrl: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                    </li>
                  );
                })}
                <li className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex gap-2">
                    <Button
                      variant="outline"
                      size="small"
                      type="button"
                      iconLeft={<Icon name="plus" size="sm" />}
                      onClick={() =>
                        patchWeek(wi, {
                          lessons: [
                            ...week.lessons,
                            {
                              ...emptyLesson(),
                              date:
                                week.lessons.at(-1)?.date ??
                                week.lessons.find((l) => l.date)?.date ??
                                "",
                            },
                          ],
                        })
                      }
                    >
                      {t("addLesson")}
                    </Button>
                    <Button
                      variant="outline"
                      size="small"
                      type="button"
                      iconLeft={<Icon name="copy" size="sm" />}
                      onClick={() =>
                        setWeeks((all) => [
                          ...all,
                          copyWeek(week, nextNumber()),
                        ])
                      }
                    >
                      {t("copyWeek")}
                    </Button>
                  </span>
                  <Button
                    variant="ghost"
                    size="small"
                    type="button"
                    iconLeft={<Icon name="eye" size="sm" />}
                    onClick={() =>
                      setWeeks((all) => all.filter((_, i) => i !== wi))
                    }
                  >
                    {t("hideWeek")}
                  </Button>
                </li>
              </WeekAccordion>
            );
          })}
        </Weeks>
        {weeks.length === 0 ? <Alert tone="info">{t("noWeeks")}</Alert> : null}
      </section>
    </form>
  );
}
