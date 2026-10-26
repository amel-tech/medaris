"use client";

import { DateTimeField } from "@medaris/ui/mds/date-time-field";
import { Field } from "@medaris/ui/mds/field";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { DEFAULT_TIME_ZONE, timeZoneCity } from "@medaris/utils";
import { useLocale, useTranslations } from "next-intl";
import { dayMonthClock } from "~/lib/dates";
import type { ReleaseForm, ReleaseProblem } from "../recordings";

/**
 * "Talebe kaydı ne zaman izlesin" (MDRS-288): "Hazır olunca hemen", the
 * session's default, or "Şu tarih ve saatte" with the kit's date-time field
 * (MDRS-278). Neither opens it before the session's start (26 October), and
 * a time before it is refused with the start named. The time is a wall time
 * on the course's clock, as the course is planned, whatever the viewer's;
 * the help names that clock. The form and
 * its checks are `recordings.ts`'s; this only draws them. The asterisk is the
 * field's only `required`: an empty field is the page's own check, worded,
 * as the link's is, rather than a submit the kit's form holds back.
 */
export function ReleaseFields({
  value,
  onChange,
  timeZone,
  startsAt,
  problem,
  disabled = false,
}: {
  value: ReleaseForm;
  /** the keys that changed, merged by the caller into what it holds */
  onChange: (patch: Partial<ReleaseForm>) => void;
  /** the course's zone */
  timeZone: string;
  /** the session's ISO start, named when a time before it is refused */
  startsAt: string | null;
  /** what is wrong, once the form was sent */
  problem: ReleaseProblem | null;
  disabled?: boolean;
}) {
  const t = useTranslations("nazar");
  const locale = useLocale();
  const zone =
    timeZone === DEFAULT_TIME_ZONE
      ? t("Sessions.zoneIstanbul")
      : timeZoneCity(timeZone);
  return (
    <div className="flex flex-col gap-3" data-testid="release">
      <RadioGroup
        legend={t("Recordings.release.legend")}
        name="release"
        bordered
        value={value.mode}
        disabled={disabled}
        onChange={(mode) => onChange({ mode: mode === "at" ? "at" : "ready" })}
        options={[
          {
            value: "ready",
            label: t("Recordings.release.ready"),
            description: t("Recordings.release.readyHelp"),
          },
          {
            value: "at",
            label: t("Recordings.release.at"),
            description: t("Recordings.release.atHelp"),
          },
        ]}
      />
      {value.mode === "at" ? (
        <Field
          label={t("Recordings.release.whenLabel")}
          required
          help={t("Recordings.release.whenHelp", { zone })}
          error={
            problem === "past"
              ? t("Recordings.release.errors.past")
              : problem === "empty"
                ? t("Recordings.release.errors.empty")
                : problem === "beforeSession" && startsAt
                  ? t("Recordings.release.errors.beforeSession", {
                      when: dayMonthClock(new Date(startsAt), locale, timeZone),
                    })
                  : undefined
          }
        >
          <DateTimeField
            name="availableAt"
            value={value.local}
            onChange={(local) => onChange({ local })}
            onBadInputChange={(bad) => onChange({ bad })}
            disabled={disabled}
            locale={locale}
            timeLabel={t("Recordings.release.timeLabel")}
            openLabel={t("Recordings.release.openCalendar")}
            dialogLabel={t("Recordings.release.pickDate")}
            listLabel={t("Recordings.release.pickTime")}
            prevMonthLabel={t("Recordings.release.prevMonth")}
            nextMonthLabel={t("Recordings.release.nextMonth")}
            todayLabel={t("Recordings.release.today")}
          />
        </Field>
      ) : null}
    </div>
  );
}
