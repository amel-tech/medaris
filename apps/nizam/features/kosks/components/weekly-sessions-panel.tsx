"use client";

import { RepeatIcon as Repeat } from "@medaris/icons";
import type {
  PlannedSessionResponse,
  WeeklyPatternDto,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/components/button";
import { Input } from "@medaris/ui/components/input";
import { Label } from "@medaris/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medaris/ui/components/select";
import { toast } from "@medaris/ui/components/sonner";
import {
  listTimeZones,
  meetingUrlProblem,
  normalizeMeetingUrl,
} from "@medaris/utils";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import {
  createCourseSessions,
  previewCourseSessions,
} from "~/features/kosks/actions/courses";
import { MEETING_URL_PROBLEM_KEY, toMinutes } from "./live-lesson-editor";

/** ISO weekdays, Monday first. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** tedrisat's reasons for refusing a pattern (INVALID_SESSION_PATTERN). */
const PROBLEMS = [
  "INVALID_DATE",
  "END_OR_COUNT_REQUIRED",
  "END_BEFORE_START",
  "RANGE_TOO_LONG",
  "TOO_MANY_SESSIONS",
  "NO_SESSIONS",
] as const;

const problemOf = (
  errorBody: unknown
): (typeof PROBLEMS)[number] | undefined => {
  const problem = (errorBody as { context?: { problem?: unknown } } | null)
    ?.context?.problem;
  return PROBLEMS.find((p) => p === problem);
};

/**
 * C6 "Haftalık tekrar" (MDRS-109, phase 1): turns "every Tuesday and Thursday
 * at 21:00" into ordinary dated sessions. tedrisat does the expansion for both
 * the preview and the save, so what is previewed is what is written.
 *
 * Placeholder layout: the C6 design (MDRS-127) does not exist yet. It uses
 * only the form's own building blocks and is to be redone when it lands.
 *
 * The batch is saved on its own, straight away, and bumps the course
 * version; the form around it was loaded before that, so it reloads after a
 * successful save rather than letting a later whole-course save hit 409.
 */
export const WeeklySessionsPanel = ({
  koskId,
  courseId,
  courseTimeZone,
}: {
  koskId: string;
  courseId: string;
  courseTimeZone: string;
}) => {
  const t = useTranslations("nizam");
  const format = useFormatter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("21:00");
  const [duration, setDuration] = useState("60");
  const [timeZone, setTimeZone] = useState(courseTimeZone);
  const timeZones = useMemo(() => listTimeZones(timeZone), [timeZone]);
  const [startDate, setStartDate] = useState("");
  const [endMode, setEndMode] = useState<"count" | "date">("count");
  const [count, setCount] = useState("8");
  const [endDate, setEndDate] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [preview, setPreview] = useState<PlannedSessionResponse[] | null>(null);

  // Any change invalidates a preview already on screen.
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPreview(null);
    };

  const pattern = (): WeeklyPatternDto | null => {
    const n = Number(count);
    if (
      !weekdays.length ||
      !/^\d{2}:\d{2}$/.test(startTime) ||
      !startDate ||
      (endMode === "count" ? !Number.isInteger(n) || n < 1 : !endDate)
    ) {
      return null;
    }
    return {
      weekdays: [...weekdays].sort((a, b) => a - b),
      startTime,
      timeZone,
      startDate,
      ...(endMode === "count" ? { count: n } : { endDate }),
    };
  };

  const refused = (error: string, errorBody: unknown) => {
    const problem = problemOf(errorBody);
    toast.error(problem ? t(`WeeklySessions.problem.${problem}`) : error);
  };

  const runPreview = () => {
    const p = pattern();
    if (!p) {
      toast.error(t("WeeklySessions.validation"));
      return;
    }
    startTransition(async () => {
      const res = await previewCourseSessions(courseId, p);
      if (res.success === false) {
        refused(res.error, res.errorBody);
        return;
      }
      setPreview(res.data.sessions);
    });
  };

  const create = () => {
    const p = pattern();
    const minutes = toMinutes(duration);
    if (!p || !title.trim() || minutes === undefined) {
      toast.error(t("WeeklySessions.validation"));
      return;
    }
    const link = normalizeMeetingUrl(meetingUrl);
    const linkProblem = meetingUrlProblem(link);
    if (linkProblem) {
      toast.error(t(MEETING_URL_PROBLEM_KEY[linkProblem]));
      return;
    }
    // The page reloads after the save; anything unsaved in the form around
    // this panel would be lost without a word.
    if (!window.confirm(t("WeeklySessions.reloadNote"))) return;
    startTransition(async () => {
      const res = await createCourseSessions(koskId, courseId, {
        ...p,
        title: title.trim(),
        durationMinutes: minutes,
        meetingUrl: link || undefined,
      });
      if (res.success === false) {
        refused(res.error, res.errorBody);
        return;
      }
      toast.success(
        t("WeeklySessions.created", { count: res.data.lessons.length })
      );
      window.location.reload();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-[13px] font-medium text-muted-foreground"
      >
        <Repeat size={14} /> {t("WeeklySessions.open")}
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-slate-50 p-3.5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Repeat size={16} /> {t("WeeklySessions.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("WeeklySessions.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-muted-foreground"
        >
          {t("WeeklySessions.close")}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-title`} className="mb-1.5 text-xs">
            {t("WeeklySessions.sessionTitle")}
          </Label>
          <Input
            id={`${id}-title`}
            placeholder={t("WeeklySessions.sessionTitlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium">
            {t("WeeklySessions.weekdays")}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    edit(setWeekdays)(
                      on ? weekdays.filter((x) => x !== d) : [...weekdays, d]
                    )
                  }
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "bg-white"}`}
                >
                  {t(`WeeklySessions.weekday.${d}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <Label htmlFor={`${id}-time`} className="mb-1.5 text-xs">
            {t("WeeklySessions.startTime")}
          </Label>
          <Input
            id={`${id}-time`}
            type="time"
            value={startTime}
            onChange={(e) => edit(setStartTime)(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-duration`} className="mb-1.5 text-xs">
            {t("WeeklySessions.duration")}
          </Label>
          <Input
            id={`${id}-duration`}
            type="number"
            min={1}
            max={1440}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <Label className="mb-1.5 text-xs">
            {t("WeeklySessions.timeZone")}
          </Label>
          <Select value={timeZone} onValueChange={edit(setTimeZone)}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeZones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${id}-start`} className="mb-1.5 text-xs">
            {t("WeeklySessions.startDate")}
          </Label>
          <Input
            id={`${id}-start`}
            type="date"
            value={startDate}
            onChange={(e) => edit(setStartDate)(e.target.value)}
          />
        </div>
        <div>
          <Label className="mb-1.5 text-xs">
            {t("WeeklySessions.endMode")}
          </Label>
          <div className="flex gap-2">
            <Select
              value={endMode}
              onValueChange={(v) => edit(setEndMode)(v as "count" | "date")}
            >
              <SelectTrigger className="w-40 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count">
                  {t("WeeklySessions.endByCount")}
                </SelectItem>
                <SelectItem value="date">
                  {t("WeeklySessions.endByDate")}
                </SelectItem>
              </SelectContent>
            </Select>
            {endMode === "count" ? (
              <Input
                aria-label={t("WeeklySessions.endByCount")}
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => edit(setCount)(e.target.value)}
              />
            ) : (
              <Input
                aria-label={t("WeeklySessions.endByDate")}
                type="date"
                value={endDate}
                onChange={(e) => edit(setEndDate)(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-link`} className="mb-1.5 text-xs">
            {t("WeeklySessions.meetingUrl")}
          </Label>
          <Input
            id={`${id}-link`}
            placeholder="https://meet.google.com/..."
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("WeeklySessions.meetingUrlHint")}
          </p>
        </div>
      </div>

      {preview && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold">
            {t("WeeklySessions.previewTitle", { count: preview.length })}
          </div>
          <ol className="max-h-64 overflow-y-auto rounded-lg border bg-white text-xs">
            {preview.map((s) => (
              <li
                key={s.scheduledAt.toString()}
                className="flex items-center gap-3 border-b px-3 py-1.5 last:border-b-0"
              >
                <span className="w-16 shrink-0 font-semibold text-muted-foreground">
                  {t("NewCoursePage.week", { number: s.weekNumber })}
                </span>
                <span>
                  {format.dateTime(new Date(s.scheduledAt), {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone,
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={runPreview}
        >
          {t("WeeklySessions.previewButton")}
        </Button>
        <Button type="button" disabled={pending || !preview} onClick={create}>
          {pending ? t("WeeklySessions.creating") : t("WeeklySessions.create")}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {t("WeeklySessions.reloadNote")}
        </span>
      </div>
    </div>
  );
};
