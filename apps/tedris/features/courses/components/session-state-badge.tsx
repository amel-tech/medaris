"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { countdown } from "@medaris/ui/mds/session-join";
import { sessionStateOf } from "../session-model";
import { useCelseClock } from "../use-celse-clock";
import { minutesSince } from "../watch-model";

export interface SessionStateBadgeLabels {
  /** keeps a literal `{minutes}`, which the badge fills in: "Canlı · 24 dk" */
  live: string;
  ended: string;
  cancelled: string;
}

/**
 * Where the celse stands, on the right of the detail page's header
 * (MDRS-289): "Sona erdi", "Canlı · 24 dk", "2 gün sonra" or "İptal edildi",
 * on its own clock. Nothing for a celse with no time.
 */
export function SessionStateBadge({
  renderedAt,
  startsAt,
  durationMinutes,
  cancelled,
  locale,
  timeZone,
  labels,
}: {
  renderedAt: string;
  startsAt: string | null;
  durationMinutes?: number;
  cancelled: boolean;
  locale: string;
  /** the viewer's zone, for the day of "Yarın" */
  timeZone: string;
  labels: SessionStateBadgeLabels;
}) {
  const now = useCelseClock(renderedAt);
  if (cancelled) return <Badge variant="outline">{labels.cancelled}</Badge>;
  if (!startsAt) return null;
  const at = new Date(startsAt);
  const state = sessionStateOf({ startsAt: at, durationMinutes }, now);
  if (state === "live")
    return (
      <Badge variant="live">
        {labels.live.replace("{minutes}", String(minutesSince(at, now)))}
      </Badge>
    );
  if (state === "ended")
    return (
      <Badge variant="secondary" icon={<Icon name="check" size="sm" />}>
        {labels.ended}
      </Badge>
    );
  return (
    <Badge variant="secondary" icon={<Icon name="clock" size="sm" />}>
      <time dateTime={startsAt}>{countdown(locale, at, now, timeZone)}</time>
    </Badge>
  );
}
