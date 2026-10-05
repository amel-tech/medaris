"use client";

import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern, toneOfHue } from "@medaris/ui/mds/cover-pattern";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { WeekAccordion, Weeks } from "@medaris/ui/mds/week-accordion";
import {
  DEFAULT_TIME_ZONE,
  normalizeMeetingUrl,
  resolveMeetingPlatform,
  timeZoneCity,
  toZonedDatetimeLocal,
} from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { linkProblem, planHref } from "../../sessions/sessions";
import { saveCurriculum } from "../actions";
import {
  type CurriculumError,
  type CurriculumForm,
  type CurriculumProblem,
  cancelledLabel,
  copyWeek,
  curriculumConflict,
  curriculumDirty,
  curriculumErrorKey,
  curriculumErrors,
  curriculumPayload,
  dayLabel,
  emptyLesson,
  headingDay,
  type LessonDraft,
  nextWeekNumber,
  type WeekDraft,
  weekDraftsOf,
  weekFacts,
} from "../curriculum";

const TONES = ["laciverd", "bordo", "zumrut", "murekkep"] as const;

/**
 * Müfredat: the course's details, its weeks and its sessions in one form.
 * Nothing is written until "Kaydet", which sends the whole course (PUT) with
 * the course version this page was read at. A week or a session taken out of
 * the form is hidden by that save, never deleted. A cancelled session is
 * shown as information. While the form differs from the saved course a strip
 * says so, with "Vazgeç" to put the saved values back.
 *
 * When somebody saved the course since the page was read, the API answers 409
 * and writes nothing: a prompt says so and offers the current course, which
 * discards this form. The page gives the editor `key={version}`, so a course
 * that is read again starts a fresh form. While the page reads the saved
 * course again after a save the form is locked, as a second save would send
 * the new weeks without the ids the first one gave them.
 *
 * What the form offers follows what the caller holds in the course (`can`).
 * Saving the course is `course.edit`: without it the form is read-only and has
 * no "Kaydet". A save that adds, moves or hides a session is `session.manage`
 * as well, so without it the buttons that add, copy or hide a session or a week
 * and the date and time of a stored session are off; the title, the agenda,
 * the link and the other fields are still `course.edit` alone. The API decides
 * the save either way.
 */
export function CurriculumEditor({
  course,
  can,
  locale,
  timeZone,
}: {
  course: CourseDetailResponse;
  can: {
    /** `course.edit`: the form can be saved */
    edit: boolean;
    /** `session.manage`: sessions can be added, moved and hidden */
    sessions: boolean;
    /** `week.hide`: the page that hides a week or a session by its own routes */
    hide: boolean;
  };
  locale: string;
  /** the zone the dates and times of the sessions are written in */
  timeZone: string;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [refreshing, startRefresh] = useTransition();

  const [saved, setSaved] = useState<CurriculumForm>(() => ({
    title: course.title,
    description: course.description ?? "",
    tone: toneOfHue(course.coverHue),
    weeks: weekDraftsOf(course, timeZone),
  }));
  const [title, setTitle] = useState(saved.title);
  const [description, setDescription] = useState(saved.description);
  const [tone, setTone] = useState(saved.tone);
  const [weeks, setWeeks] = useState<WeekDraft[]>(saved.weeks);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  const current: CurriculumForm = { title, description, tone, weeks };
  const dirty = curriculumDirty(current, saved);
  const errors = curriculumErrors(title, weeks);
  const shown = (kind: CurriculumProblem, wi?: number, li?: number) =>
    sent &&
    errors.some(
      (error: CurriculumError) =>
        error.kind === kind &&
        error.weekIndex === wi &&
        error.lessonIndex === li
    );
  const locked = saving || refreshing || !can.edit;
  const sessionsLocked = locked || !can.sessions;

  const sessionCount = weeks.reduce(
    (n, week) =>
      n + week.lessons.filter((lesson) => !lesson.cancelledAt).length,
    0
  );

  const reset = () => {
    setTitle(saved.title);
    setDescription(saved.description);
    setTone(saved.tone);
    setWeeks(saved.weeks);
    setSent(false);
  };

  const patchWeek = (wi: number, change: Partial<WeekDraft>) =>
    setWeeks((all) =>
      all.map((week, i) => (i === wi ? { ...week, ...change } : week))
    );
  const patchLesson = (wi: number, li: number, change: Partial<LessonDraft>) =>
    setWeeks((all) =>
      all.map((week, i) =>
        i === wi
          ? {
              ...week,
              lessons: week.lessons.map((lesson, j) =>
                j === li ? { ...lesson, ...change } : lesson
              ),
            }
          : week
      )
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked || conflict) return;
    if (errors.length > 0) {
      setSent(true);
      return;
    }
    setSaving(true);
    const result = await saveCurriculum(
      course.id,
      curriculumPayload(course, current, timeZone)
    );
    setSaving(false);
    if (!result.success) {
      if (curriculumConflict(result.code)) {
        setConflict(true);
        return;
      }
      notify({
        tone: "error",
        title: t("Curriculum.failed"),
        description: words(curriculumErrorKey(result.code)),
      });
      return;
    }
    setSaved(current);
    setSent(false);
    notify({
      title: t("Curriculum.saved"),
      description: t("Curriculum.savedBody", { name: title.trim() }),
    });
    startRefresh(() => router.refresh());
  };

  // Today in the zone the sessions' dates are written in: the UTC day is a day
  // behind in Istanbul from 00:00 to 03:00.
  const nowDay = toZonedDatetimeLocal(new Date(), timeZone).slice(0, 10);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={submit}
      noValidate
      data-testid="curriculum"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Curriculum.title")}</h1>
          <p className="mds-body-sm text-neutral-muted">
            {t("Curriculum.intro", { name: course.title })}
          </p>
        </div>
        {can.edit ? (
          <div className="flex items-center gap-3">
            {dirty ? (
              <output className="mds-caption" data-testid="dirty">
                {t("Curriculum.dirty")}
              </output>
            ) : null}
            <Button
              variant="ghost"
              type="button"
              disabled={!dirty || locked}
              onClick={reset}
            >
              {t("Curriculum.cancel")}
            </Button>
            <Button
              type="submit"
              loading={saving}
              loadingLabel={t("Curriculum.saving")}
              disabled={!dirty || refreshing || conflict}
            >
              {t("Curriculum.save")}
            </Button>
          </div>
        ) : null}
      </header>

      {!can.edit ? (
        <Alert tone="info">
          <p>{t("Curriculum.readOnly")}</p>
        </Alert>
      ) : !can.sessions ? (
        <Alert tone="info">
          <p>{t("Curriculum.sessionsNote")}</p>
        </Alert>
      ) : null}

      {conflict ? (
        <Alert tone="warning" title={t("Curriculum.conflictTitle")}>
          <p>{t("Curriculum.conflictBody")}</p>
          <p>
            <Button
              type="button"
              variant="secondary"
              size="small"
              loading={refreshing}
              loadingLabel={t("Curriculum.reloading")}
              onClick={() => startRefresh(() => router.refresh())}
            >
              {t("Curriculum.conflictReload")}
            </Button>
          </p>
        </Alert>
      ) : null}

      <section
        className="mds-card flex flex-col gap-4"
        aria-labelledby="c-info"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="c-info" className="mds-h2">
            {t("Curriculum.infoTitle")}
          </h2>
          <span className="mds-caption">* {t("Curriculum.requiredNote")}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={t("Curriculum.nameLabel")}
            required
            help={t("Curriculum.nameHelp")}
            error={shown("title") ? t("Curriculum.errors.title") : undefined}
          >
            <Input
              name="title"
              value={title}
              maxLength={200}
              disabled={locked}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <RadioGroup
            legend={t("Curriculum.toneLegend")}
            name="tone"
            className="flex-row flex-wrap gap-x-5 [&>.mds-label]:basis-full"
            value={tone}
            onChange={(value) => setTone(value as typeof tone)}
            options={TONES.map((value) => ({
              value,
              label: (
                <span className="inline-flex items-center gap-2">
                  <CoverPattern tone={value} size="xs" />
                  {t(`Curriculum.tones.${value}`)}
                </span>
              ),
            }))}
          />
        </div>
        <Field
          label={t("Curriculum.descLabel")}
          help={t("Curriculum.descHelp")}
        >
          <Textarea
            name="description"
            rows={4}
            maxLength={2000}
            value={description}
            disabled={locked}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="c-weeks">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="c-weeks" className="mds-h2">
              {t("Curriculum.weeksTitle")}
            </h2>
            <p className="mds-caption">
              {t("Curriculum.weeksSummary", {
                weeks: weeks.length,
                sessions: sessionCount,
                zone:
                  timeZone === DEFAULT_TIME_ZONE
                    ? t("Curriculum.zoneIstanbul")
                    : t("Curriculum.zoneOther", {
                        zone: timeZoneCity(timeZone),
                      }),
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can.sessions ? (
              <Button
                variant="secondary"
                href={planHref(course.id)}
                iconLeft={<Icon name="repeat" size="sm" />}
              >
                {t("Curriculum.generate")}
              </Button>
            ) : null}
            {can.hide ? (
              <Button
                variant="ghost"
                href={`/ders/${course.id}/mufredat/gizle`}
              >
                {t("Curriculum.hidePage")}
              </Button>
            ) : null}
            {can.edit ? (
              <Button
                variant="outline"
                type="button"
                disabled={locked}
                iconLeft={<Icon name="plus" size="sm" />}
                onClick={() =>
                  setWeeks((all) => [
                    ...all,
                    {
                      weekNumber: nextWeekNumber(all),
                      title: "",
                      summary: "",
                      lessons: [],
                    },
                  ])
                }
              >
                {t("Curriculum.addWeek")}
              </Button>
            ) : null}
          </div>
        </div>
        {dirty && sessionCount > 0 ? (
          <p className="mds-caption">{t("Curriculum.generateNote")}</p>
        ) : null}

        <Weeks
          defaultOpen={weeks
            .filter((week) => {
              const facts = weekFacts(week);
              return (
                facts.to !== null && facts.from !== null && facts.to >= nowDay
              );
            })
            .slice(0, 1)
            .map((week) => week.weekNumber)}
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
                title={week.title || t("Curriculum.untitledWeek")}
                state={active ? "active" : done ? "done" : "default"}
                weekLabel={t.raw("Curriculum.weekLabel") as string}
                activeLabel={t("Curriculum.weekActive")}
                doneLabel={t("Curriculum.weekDone")}
                emptyLabel={t("Curriculum.weekEmpty")}
                locale={locale}
                meta={
                  facts.from && facts.to
                    ? t("Curriculum.weekMeta", {
                        from: dayLabel(locale, facts.from, false),
                        to: dayLabel(locale, facts.to, false),
                        sessions: facts.sessions,
                        minutes: facts.minutes,
                      })
                    : t("Curriculum.weekMetaNoDates", {
                        sessions: facts.sessions,
                      })
                }
              >
                <li className="flex flex-col gap-4 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label={t("Curriculum.weekTitleLabel")}
                      required
                      error={
                        shown("weekTitle", wi)
                          ? t("Curriculum.errors.weekTitle")
                          : undefined
                      }
                    >
                      <Input
                        name={`week-${wi}-title`}
                        value={week.title}
                        maxLength={200}
                        disabled={locked}
                        onChange={(event) =>
                          patchWeek(wi, { title: event.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label={t("Curriculum.weekSummaryLabel")}
                      help={t("Curriculum.weekSummaryHelp")}
                    >
                      <Textarea
                        name={`week-${wi}-summary`}
                        rows={3}
                        maxLength={500}
                        value={week.summary}
                        disabled={locked}
                        onChange={(event) =>
                          patchWeek(wi, { summary: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                </li>
                {week.lessons.map((lesson, li) => {
                  const url = normalizeMeetingUrl(lesson.meetingUrl);
                  const platform = resolveMeetingPlatform(url);
                  const problem = linkProblem(lesson.meetingUrl);
                  return (
                    <li
                      key={lesson.id ?? `new-${li}`}
                      className="mds-card flex flex-col gap-3"
                      data-testid={`lesson-${wi}-${li}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="mds-label">
                          {t("Curriculum.lessonHeading", {
                            n: li + 1,
                            when: lesson.date
                              ? `${headingDay(locale, lesson.date)} ${lesson.time}`
                              : "",
                          })}
                        </h3>
                        <span className="flex items-center gap-2">
                          {lesson.cancelledAt ? (
                            <Badge variant="outline">
                              {t("Curriculum.cancelled")}
                            </Badge>
                          ) : !url ? (
                            <Badge
                              variant="warning"
                              icon={<Icon name="link" size="sm" />}
                            >
                              {t("Curriculum.linkMissing")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              {t("Curriculum.scheduled")}
                            </Badge>
                          )}
                          {lesson.cancelledAt ||
                          !(can.edit && can.sessions) ? null : (
                            <Button
                              variant="ghost"
                              size="small"
                              type="button"
                              disabled={locked}
                              iconLeft={<Icon name="eye" size="sm" />}
                              onClick={() =>
                                patchWeek(wi, {
                                  lessons: week.lessons.filter(
                                    (_, j) => j !== li
                                  ),
                                })
                              }
                            >
                              {t("Curriculum.hide")}
                            </Button>
                          )}
                        </span>
                      </div>
                      {lesson.cancelledAt ? (
                        <div className="flex flex-col gap-1">
                          <p>
                            <bdi>{lesson.title}</bdi>
                            {lesson.duration
                              ? ` · ${t("Curriculum.minutes", { minutes: lesson.duration })}`
                              : ""}
                          </p>
                          <p className="mds-caption">
                            {t("Curriculum.cancelledNote", {
                              when: cancelledLabel(
                                locale,
                                lesson.cancelledAt,
                                timeZone
                              ),
                            })}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field
                              label={t("Curriculum.lessonTitleLabel")}
                              required
                              help={
                                lesson.makeup
                                  ? t("Curriculum.makeupNote", {
                                      n: week.weekNumber,
                                    })
                                  : undefined
                              }
                              error={
                                shown("lessonTitle", wi, li)
                                  ? t("Curriculum.errors.lessonTitle")
                                  : undefined
                              }
                            >
                              <Input
                                name={`lesson-${wi}-${li}-title`}
                                value={lesson.title}
                                maxLength={200}
                                disabled={locked}
                                onChange={(event) =>
                                  patchLesson(wi, li, {
                                    title: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            {/* MDRS-279: the session's own source line, the
                                tedrisat column's 120 characters at most. */}
                            <Field
                              label={t("Curriculum.kaynakLabel")}
                              help={t("Curriculum.kaynakHelp")}
                            >
                              <Input
                                name={`lesson-${wi}-${li}-kaynak`}
                                value={lesson.kaynak}
                                maxLength={120}
                                dir="auto"
                                disabled={locked}
                                onChange={(event) =>
                                  patchLesson(wi, li, {
                                    kaynak: event.target.value,
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <Field
                              label={t("Curriculum.dateLabel")}
                              required
                              error={
                                shown("lessonDate", wi, li)
                                  ? t("Curriculum.errors.lessonDate")
                                  : undefined
                              }
                            >
                              <Input
                                type="date"
                                name={`lesson-${wi}-${li}-date`}
                                value={lesson.date}
                                disabled={sessionsLocked}
                                onChange={(event) =>
                                  patchLesson(wi, li, {
                                    date: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field
                              label={t("Curriculum.timeLabel")}
                              required
                              error={
                                shown("lessonTime", wi, li)
                                  ? t("Curriculum.errors.lessonTime")
                                  : undefined
                              }
                            >
                              <Input
                                type="time"
                                name={`lesson-${wi}-${li}-time`}
                                value={lesson.time}
                                disabled={sessionsLocked}
                                onChange={(event) =>
                                  patchLesson(wi, li, {
                                    time: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field
                              label={t("Curriculum.durationLabel")}
                              required
                              error={
                                shown("lessonDuration", wi, li)
                                  ? t("Curriculum.errors.lessonDuration")
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
                                trailing={t("Curriculum.durationUnit")}
                                disabled={locked}
                                onChange={(event) =>
                                  patchLesson(wi, li, {
                                    duration: event.target.value,
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <Field
                            label={
                              <span className="flex w-full items-center justify-between gap-2">
                                {t("Curriculum.linkLabel")}
                                {url && platform.id !== "unknown" ? (
                                  <PlatformChip
                                    platform={platform.id}
                                    detected
                                    detectedLabel={t("Curriculum.detected")}
                                  />
                                ) : null}
                              </span>
                            }
                            help={t(
                              url
                                ? "Curriculum.linkHelpFilled"
                                : "Curriculum.linkHelp"
                            )}
                            error={
                              shown("link", wi, li) && problem
                                ? t("Curriculum.errors.link")
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
                              disabled={locked}
                              onChange={(event) =>
                                patchLesson(wi, li, {
                                  meetingUrl: event.target.value,
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
                    {can.sessions && can.edit ? (
                      <>
                        <Button
                          variant="outline"
                          size="small"
                          type="button"
                          disabled={locked}
                          iconLeft={<Icon name="plus" size="sm" />}
                          onClick={() =>
                            patchWeek(wi, {
                              lessons: [
                                ...week.lessons,
                                emptyLesson(
                                  week.lessons.at(-1)?.date ??
                                    week.lessons.find((lesson) => lesson.date)
                                      ?.date ??
                                    ""
                                ),
                              ],
                            })
                          }
                        >
                          {t("Curriculum.addLesson")}
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          type="button"
                          disabled={locked}
                          iconLeft={<Icon name="copy" size="sm" />}
                          onClick={() =>
                            setWeeks((all) => [
                              ...all,
                              copyWeek(week, nextWeekNumber(all)),
                            ])
                          }
                        >
                          {t("Curriculum.copyWeek")}
                        </Button>
                      </>
                    ) : null}
                  </span>
                  {can.edit && (can.sessions || week.lessons.length === 0) ? (
                    <Button
                      variant="ghost"
                      size="small"
                      type="button"
                      disabled={locked}
                      iconLeft={<Icon name="eye" size="sm" />}
                      onClick={() =>
                        setWeeks((all) => all.filter((_, i) => i !== wi))
                      }
                    >
                      {t("Curriculum.hideWeek")}
                    </Button>
                  ) : null}
                </li>
              </WeekAccordion>
            );
          })}
        </Weeks>
        {weeks.length === 0 ? (
          <Alert tone="info">{t("Curriculum.noWeeks")}</Alert>
        ) : null}
      </section>
    </form>
  );
}
