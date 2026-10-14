"use client";

import type {
  CourseDetailResponse,
  CourseResourceFileUploadResponse,
  LessonResourceFileUploadResponse,
} from "@medaris/services/tedrisat";
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
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { fileRoutes } from "../../files/files";
import { linkProblem, planHref } from "../../sessions/sessions";
import { saveCurriculum } from "../actions";
import {
  type AssignmentState,
  assignmentsOf,
  type CurriculumError,
  type CurriculumForm,
  type CurriculumProblem,
  cancelledLabel,
  copyWeek,
  courseAfterLessonUpload,
  courseAfterUpload,
  curriculumConflict,
  curriculumDirty,
  curriculumErrorKey,
  curriculumErrors,
  curriculumPayload,
  dayLabel,
  emptyLesson,
  headingDay,
  type LessonDraft,
  lessonResourceDraftOf,
  lessonWithoutAccess,
  linkHelpKey,
  nextWeekNumber,
  type ResourceDraft,
  resourceDraftOf,
  resourceDraftsOf,
  type WeekDraft,
  weekDraftsOf,
  weekFacts,
  withLessonResource,
} from "../curriculum";
import { LessonAssignmentEditor } from "./lesson-assignment-editor";
import { LessonResourcesEditor } from "./lesson-resources-editor";
import { ResourcesEditor } from "./resources-editor";

const TONES = ["laciverd", "bordo", "zumrut", "murekkep"] as const;

/**
 * An open week is long: its heading stays at the top of the viewport while
 * its celses scroll under it, so the week being edited is always named. The
 * heading is the item's first child; Tailwind reads `_` in an arbitrary
 * variant as a space, so `.mds-week__heading` cannot be named here.
 */
const STICKY_WEEK_HEADING =
  "[&>:first-child]:sticky [&>:first-child]:top-0 [&>:first-child]:z-1 [&>:first-child]:rounded-t-[inherit] [&>:first-child]:bg-neutral-surface";

/**
 * Müfredat: the course's details, its weeks and its sessions in one form.
 * Nothing is written until "Kaydet", which sends the whole course (PUT) with
 * the course version this page was read at. A week or a session taken out of
 * the form is hidden by that save, never deleted. A cancelled session is
 * shown as information. While the form differs from the saved course a strip
 * says so, with "Vazgeç" to put the saved values back. A session still ahead
 * with no link, no live stream and not held in person is flagged "Katılım
 * yolu eksik"; a link is not asked of one that is streamed or held in person
 * (MDRS-283).
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
 * as well, so without it the buttons that add, copy or hide a session or a week,
 * the date and time of a stored session and the session's own resources
 * (MDRS-286) are off; the title, the agenda, the link and the other fields are
 * still `course.edit` alone. The API decides the save either way.
 *
 * A file uploaded to the course's or a session's resources (MDRS-287) is
 * stored by its upload, which also bumps the course's version. The editor
 * keeps the course as it now stands (`read`): the new row joins both the form
 * and its saved values, so it is no unsaved change and "Vazgeç" keeps it, and
 * the next "Kaydet" sends the version the upload answered with. One upload
 * runs at a time, and "Kaydet" waits for it, so no save goes out with a
 * version an upload is about to move.
 *
 * Each stored celse has an "Ödev" block of its own under its resources: the
 * homework the course team sets on it, apart from the resource list
 * (`LessonAssignmentEditor`). It is stored by its own writes, at once and
 * under `session.manage`, never by "Kaydet", so it is no unsaved change of
 * the form; the editor keeps what is stored (`assignments`).
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
  // The course as stored, as far as this page knows: the read, then each
  // upload's row and version (MDRS-287). The save is built against it.
  const [read, setRead] = useState(course);
  const [uploads, setUploads] = useState(0);
  // Each stored celse's homework, as its own writes left it.
  const [assignments, setAssignments] = useState<
    Record<string, AssignmentState | null>
  >(() => assignmentsOf(course));

  const [saved, setSaved] = useState<CurriculumForm>(() => ({
    title: course.title,
    description: course.description ?? "",
    tone: toneOfHue(course.coverHue),
    weeks: weekDraftsOf(course, timeZone),
    resources: resourceDraftsOf(course),
  }));
  const [title, setTitle] = useState(saved.title);
  const [description, setDescription] = useState(saved.description);
  const [tone, setTone] = useState(saved.tone);
  const [weeks, setWeeks] = useState<WeekDraft[]>(saved.weeks);
  const [resources, setResources] = useState<ResourceDraft[]>(saved.resources);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  // Which celses show their details, by id (or position, before the save
  // gives one an id); a celse not in here follows its default.
  const [openLessons, setOpenLessons] = useState<Record<string, boolean>>({});
  // The open weeks are held here, not derived from the dates on each render:
  // derived, a date edit changed the set and the accordion started over,
  // closing every week (MDRS-276). It opens on the first week still running.
  const [openWeeks, setOpenWeeks] = useState<number[]>(() => {
    const today = toZonedDatetimeLocal(new Date(), timeZone).slice(0, 10);
    return saved.weeks
      .filter((week) => {
        const facts = weekFacts(week);
        return facts.to !== null && facts.from !== null && facts.to >= today;
      })
      .slice(0, 1)
      .map((week) => week.weekNumber);
  });

  const current: CurriculumForm = {
    title,
    description,
    tone,
    weeks,
    resources,
  };
  const dirty = curriculumDirty(current, saved);
  const errors = curriculumErrors(title, weeks, resources);
  const shown = (kind: CurriculumProblem, wi?: number, li?: number) =>
    sent &&
    errors.some(
      (error: CurriculumError) =>
        error.kind === kind &&
        error.weekIndex === wi &&
        error.lessonIndex === li
    );
  const shownResource = (kind: CurriculumProblem, ri: number) =>
    sent &&
    errors.some(
      (error: CurriculumError) =>
        error.kind === kind && error.resourceIndex === ri
    );
  const shownLessonResource = (
    kind: CurriculumProblem,
    wi: number,
    li: number,
    ri: number
  ) =>
    sent &&
    errors.some(
      (error: CurriculumError) =>
        error.kind === kind &&
        error.weekIndex === wi &&
        error.lessonIndex === li &&
        error.resourceIndex === ri
    );
  const locked = saving || refreshing || !can.edit;
  const sessionsLocked = locked || !can.sessions;
  const onBusyChange = (busy: boolean) =>
    setUploads((n) => Math.max(0, n + (busy ? 1 : -1)));

  const onCourseUpload = (upload: CourseResourceFileUploadResponse) => {
    const row = resourceDraftOf(upload.resource);
    setRead((now) => courseAfterUpload(now, upload));
    setResources((rows) => [...rows, row]);
    setSaved((now) => ({ ...now, resources: [...now.resources, row] }));
  };
  const onLessonUpload =
    (lessonId: string) => (upload: LessonResourceFileUploadResponse) => {
      const row = lessonResourceDraftOf(upload.resource);
      setRead((now) => courseAfterLessonUpload(now, lessonId, upload));
      setWeeks((all) => withLessonResource(all, lessonId, row));
      setSaved((now) => ({
        ...now,
        weeks: withLessonResource(now.weeks, lessonId, row),
      }));
    };

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
    setResources(saved.resources);
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
    if (locked || conflict || uploads > 0) return;
    if (errors.length > 0) {
      setSent(true);
      return;
    }
    setSaving(true);
    const result = await saveCurriculum(
      course.id,
      curriculumPayload(read, current, timeZone)
    );
    if (handleUnauthenticated(result)) return;
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
  const now = new Date();
  const nowDay = toZonedDatetimeLocal(now, timeZone).slice(0, 10);

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

      <ResourcesEditor
        courseId={course.id}
        resources={resources}
        onChange={setResources}
        shown={shownResource}
        disabled={locked}
        editable={can.edit}
        locked={course.contentLocked}
        upload={{
          route: fileRoutes.courseResources(course.id),
          blocked: uploads > 0,
          onBusyChange,
          onUploaded: onCourseUpload,
        }}
        locale={locale}
      />

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
                onClick={() => {
                  const weekNumber = nextWeekNumber(weeks);
                  setWeeks((all) => [
                    ...all,
                    { weekNumber, title: "", summary: "", lessons: [] },
                  ]);
                  // the new week opens, and Weeks brings it into view
                  setOpenWeeks((open) => [...open, weekNumber]);
                }}
              >
                {t("Curriculum.addWeek")}
              </Button>
            ) : null}
          </div>
        </div>
        {dirty && sessionCount > 0 ? (
          <p className="mds-caption">{t("Curriculum.generateNote")}</p>
        ) : null}

        <Weeks value={openWeeks} onValueChange={setOpenWeeks} scrollOnOpen>
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
                className={STICKY_WEEK_HEADING}
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
                  const lessonKey = lesson.id ?? `new-${wi}-${li}`;
                  // A stored celse opens folded, a new one open; one with a
                  // problem the save is waiting on is always open.
                  const open =
                    (openLessons[lessonKey] ?? !lesson.id) ||
                    (sent &&
                      errors.some(
                        (error) =>
                          error.weekIndex === wi && error.lessonIndex === li
                      ));
                  const detailsId = `lesson-${wi}-${li}-details`;
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
                          ) : lessonWithoutAccess(
                              lesson,
                              course.inPerson,
                              timeZone,
                              now
                            ) ? (
                            <Badge
                              variant="warning"
                              icon={<Icon name="link" size="sm" />}
                            >
                              {t("Curriculum.accessMissing")}
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
                          {/* When first: the date, the time and the length
                              of the celse, the fields a programme is kept by. */}
                          <div
                            className="grid gap-4 md:grid-cols-3"
                            data-testid={`lesson-${wi}-${li}-when`}
                          >
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
                          <div className="flex flex-wrap items-center justify-between gap-2 border-bs border-neutral-subtle pbs-3">
                            <p className="mds-body-sm min-w-0 truncate text-neutral-muted">
                              <bdi>
                                {lesson.title.trim() ||
                                  t("Curriculum.untitledLesson")}
                              </bdi>
                            </p>
                            <Button
                              variant="ghost"
                              size="small"
                              type="button"
                              aria-expanded={open}
                              aria-controls={detailsId}
                              iconRight={
                                <Icon
                                  name={open ? "chevronUp" : "chevronDown"}
                                  size="sm"
                                />
                              }
                              onClick={() =>
                                setOpenLessons((all) => ({
                                  ...all,
                                  [lessonKey]: !open,
                                }))
                              }
                            >
                              {t(
                                open
                                  ? "Curriculum.detailsHide"
                                  : "Curriculum.detailsShow"
                              )}
                            </Button>
                          </div>
                          {/* The rest of the celse folds away: its title and
                              source, its link, then its resources and its
                              homework, each a block of its own at the end. */}
                          <div
                            id={detailsId}
                            hidden={!open}
                            // no display class while folded: a utility's
                            // display would beat the base layer's [hidden]
                            className={open ? "flex flex-col gap-3" : undefined}
                          >
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
                                help={t(
                                  course.contentLocked
                                    ? "Curriculum.kaynakLocked"
                                    : "Curriculum.kaynakHelp"
                                )}
                              >
                                <Input
                                  name={`lesson-${wi}-${li}-kaynak`}
                                  value={lesson.kaynak}
                                  maxLength={120}
                                  dir="auto"
                                  // A content-locked read carries no source
                                  // line: there is nothing here to edit, and the
                                  // save leaves the stored one alone.
                                  disabled={locked || course.contentLocked}
                                  onChange={(event) =>
                                    patchLesson(wi, li, {
                                      kaynak: event.target.value,
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
                              help={t(linkHelpKey(lesson, course.inPerson))}
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
                            {/* MDRS-286: the session's own links, under its
                                source line. Changing them is session work. */}
                            <LessonResourcesEditor
                              prefix={`lesson-${wi}-${li}`}
                              lessonId={lesson.id}
                              resources={lesson.resources}
                              onChange={(resources) =>
                                patchLesson(wi, li, { resources })
                              }
                              shown={(kind, ri) =>
                                shownLessonResource(kind, wi, li, ri)
                              }
                              locked={course.contentLocked}
                              disabled={sessionsLocked}
                              editable={can.edit && can.sessions}
                              sessionsNote={can.edit && !can.sessions}
                              upload={{
                                route: lesson.id
                                  ? fileRoutes.lessonResources(lesson.id)
                                  : null,
                                blocked: uploads > 0,
                                onBusyChange,
                                onUploaded: lesson.id
                                  ? onLessonUpload(lesson.id)
                                  : () => undefined,
                              }}
                              locale={locale}
                            />
                            {/* The celse's homework, apart from its resources:
                                stored by its own writes, never by "Kaydet". */}
                            <LessonAssignmentEditor
                              prefix={`lesson-${wi}-${li}`}
                              lessonId={lesson.id}
                              assignment={
                                (lesson.id && assignments[lesson.id]) || null
                              }
                              onChange={(next) => {
                                const id = lesson.id;
                                if (id) {
                                  setAssignments((all) => ({
                                    ...all,
                                    [id]: next,
                                  }));
                                }
                              }}
                              locked={course.contentLocked}
                              editable={can.sessions}
                              disabled={saving || refreshing}
                              upload={{ blocked: uploads > 0, onBusyChange }}
                              locale={locale}
                            />
                          </div>
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
                          onClick={() => {
                            const weekNumber = nextWeekNumber(weeks);
                            setWeeks((all) => [
                              ...all,
                              copyWeek(week, weekNumber),
                            ]);
                            setOpenWeeks((open) => [...open, weekNumber]);
                          }}
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
      {/* Kaydet is always in reach: the bar sticks to the bottom of the
          viewport however far down the weeks the form is. */}
      {can.edit ? (
        <div
          className="sticky bottom-0 z-2 -mx-2 flex flex-wrap items-center justify-end gap-3 rounded-t-surface border-bs border-neutral-subtle bg-neutral-surface px-4 py-3"
          data-testid="save-bar"
        >
          {dirty ? (
            <output className="mds-caption me-auto" data-testid="dirty">
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
            disabled={!dirty || refreshing || conflict || uploads > 0}
          >
            {t("Curriculum.save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
