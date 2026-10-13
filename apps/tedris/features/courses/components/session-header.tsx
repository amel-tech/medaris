import type { SessionMuderrisResponse } from "@medaris/services/tedrisat";
import { type ImamStarLabels, showsImamStar } from "@medaris/ui/lib/imam-star";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Icon } from "@medaris/ui/mds/icon";
import { ImamStar } from "@medaris/ui/mds/imam-star";
import type { ReactNode } from "react";

/**
 * The header of a celse's page (MDRS-289): Köşk › Ders › Hafta N, the
 * eyebrow "Hafta N · K. celse", the title, where the celse stands on the
 * right, and one meta line under them: the day and the time on the course's
 * clock, the viewer's own time when it shows another, the length, and the
 * müderris, the imam's star after the name where the course has more than one
 * (2026-10-13). No hooks, so the server detail page and the client locked page
 * draw it alike; every word comes in already translated.
 */
export const SessionHeader = ({
  crumbs,
  breadcrumbLabel,
  eyebrow,
  title,
  badge,
  when,
  length,
  muderris,
  imamStar,
}: {
  crumbs: { label: string; href?: string }[];
  breadcrumbLabel: string;
  eyebrow: string;
  title: string;
  /** the state badge, a client piece with its own clock */
  badge?: ReactNode;
  /** absent for a celse with no time */
  when?: {
    /** ISO start */
    dateTime: string;
    /** "3 Ekim Cumartesi · 23:20–00:20" */
    text: string;
    /** "İstanbul saatiyle" */
    zone: string;
    /** "Paz 05:20 senin saatinle", when the viewer's clock shows another time */
    local: string | null;
  };
  /** "60 dk" */
  length?: string | null;
  muderris: readonly SessionMuderrisResponse[];
  imamStar: ImamStarLabels;
}) => (
  <div className="flex min-inline-0 flex-col gap-4">
    <Breadcrumb items={crumbs} label={breadcrumbLabel} />
    {/* On a phone the badge sits on the eyebrow's line; from md up it
        stands on the right, level with the title's foot (MDRS-289). */}
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-6 gap-y-2">
      <p className="mds-eyebrow col-start-1 row-start-1">{eyebrow}</p>
      <h1
        className="mds-h1 col-start-1 row-start-2 max-md:col-span-2"
        dir="auto"
      >
        {title}
      </h1>
      {badge ? (
        <div
          className="col-start-2 row-start-1 row-span-2 self-end max-md:row-span-1 max-md:self-center"
          data-testid="session-state"
        >
          {badge}
        </div>
      ) : null}
    </div>
    {when || length || muderris.length > 0 ? (
      <div
        className="mds-body-sm flex flex-wrap items-center gap-x-5 gap-y-2 text-neutral-muted"
        data-testid="session-meta"
      >
        {when ? (
          <span className="inline-flex items-center gap-2">
            <Icon name="calendar" size="sm" />
            <span>
              <time className="text-neutral-default" dateTime={when.dateTime}>
                {when.text}
              </time>{" "}
              {when.zone}
            </span>
          </span>
        ) : null}
        {when?.local ? <span>{when.local}</span> : null}
        {length ? <span>{length}</span> : null}
        {muderris.map((m) => (
          <span key={m.name} className="inline-flex items-center gap-2">
            <Avatar name={m.name} size="sm" decorative />
            <span className="text-neutral-default" dir="auto">
              {m.name}
            </span>
            {showsImamStar(m.isImam, muderris.length) ? (
              <ImamStar labels={imamStar} />
            ) : null}
          </span>
        ))}
      </div>
    ) : null}
  </div>
);
