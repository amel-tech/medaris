"use client";

import type { AgendaStepResponse } from "@medaris/services/tedrisat";
import { currentAgendaStep } from "../session-model";
import { useCelseClock } from "../use-celse-clock";
import { ArabicText } from "./arabic-text";

/**
 * "Gündem" of the celse detail page: the agenda on the course's clock.
 * While the celse is live, the step whose time has come is marked "şimdi"
 * and `aria-current="step"` (MDRS-289), on the page's half-minute clock.
 * The agenda is content: the API sends it only to who may read it.
 */
export function SessionAgenda({
  agenda,
  renderedAt,
  startsAt,
  durationMinutes,
  courseTimeZone,
  labels,
}: {
  agenda: readonly AgendaStepResponse[];
  renderedAt: string;
  startsAt: string | null;
  durationMinutes?: number;
  courseTimeZone: string;
  labels: { title: string; zone: string; now: string };
}) {
  const now = useCelseClock(renderedAt);
  const current = currentAgendaStep(
    agenda,
    {
      startsAt: startsAt ? new Date(startsAt) : null,
      durationMinutes,
      timeZone: courseTimeZone,
    },
    now
  );
  return (
    <section
      className="mds-card flex flex-col gap-3"
      aria-labelledby="agenda-title"
    >
      <div className="mds-card__header">
        <h2 className="mds-card__title" id="agenda-title">
          {labels.title}
        </h2>
      </div>
      <p className="mds-caption">{labels.zone}</p>
      <ol className="m-0 flex list-none flex-col p-0">
        {agenda.map((step, i) => {
          const isNow = i === current;
          return (
            <li
              key={i}
              className={`flex items-baseline gap-3 rounded-[var(--radius-control)] px-3 py-3 border-be border-neutral-subtle last:border-be-0${isNow ? " bg-live-subtle" : ""}`}
              aria-current={isNow ? "step" : undefined}
            >
              <span
                className={`mds-caption mds-num min-inline-12${isNow ? " text-live-default" : ""}`}
              >
                {step.time}
              </span>
              <span className="flex min-inline-0 flex-1 flex-col">
                <span className="mds-body-sm" dir="auto">
                  <ArabicText text={step.title} />
                </span>
              </span>
              {isNow ? (
                <span className="mds-caption text-live-default">
                  {labels.now}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
