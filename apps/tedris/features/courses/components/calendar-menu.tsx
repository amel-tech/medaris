"use client";

import { Icon } from "@medaris/ui/mds/icon";
import { Menu } from "@medaris/ui/mds/menu";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "~/lib/i18n/navigation";
import {
  googleCalendarUrl,
  icsDownloadPath,
  sessionPagePath,
} from "../calendar-links";

export interface CalendarMenuLabels {
  /** the trigger's name: "Takvime ekle", or "Takvime ekle: {title}" for an icon-only one */
  button: string;
  google: string;
  apple: string;
  /** the toast when the .ics file cannot be fetched */
  downloadFailed: string;
  subscribe: string;
  note: string;
  linkIsOnPage: string;
}

/**
 * "Takvime ekle" (design tedris/22): a Google Calendar link opened in a new
 * tab, the session as an .ics file, and the way to the personal subscription
 * (design tedris/23). The Google link is built here, in the browser, from the
 * page's own origin; the file comes from tedrisat through tedris's handler.
 * Neither carries the meeting link: the note under the rows says so.
 *
 * `text` draws the small text button of the session page's join card; without
 * it the trigger is the icon-only button of a Programım row.
 */
export function CalendarMenu({
  courseId,
  courseTitle,
  lesson,
  locale,
  labels,
  text = false,
}: {
  courseId: string;
  courseTitle: string;
  lesson: {
    id: string;
    title: string;
    startsAt: string;
    durationMinutes?: number;
  };
  locale: string;
  labels: CalendarMenuLabels;
  text?: boolean;
}) {
  const router = useRouter();
  const toaster = useToaster();

  // A plain navigation to the handler would replace the page with its raw
  // error body when tedrisat is down, so the file is fetched and handed to the
  // browser as a download; a failure is a toast and the page stays.
  const downloadIcs = async () => {
    const path = icsDownloadPath(lesson.id, locale);
    try {
      const response = await fetch(path, { credentials: "same-origin" });
      // Not signed in: the handler redirects to the sign-in page, which the
      // browser has to show, so hand the navigation to it.
      if (response.redirected) {
        window.location.assign(path);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `medaris-${lesson.id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toaster.notify({ tone: "error", title: labels.downloadFailed });
    }
  };

  return (
    <Menu
      label={labels.button}
      text={text ? labels.button : undefined}
      size={text ? "small" : "mini"}
      icon={<Icon name="calendarPlus" size="sm" />}
      note={labels.note}
      items={[
        {
          value: "google",
          label: labels.google,
          icon: <Icon name="calendar" size="sm" />,
          onSelect: () => {
            const url = googleCalendarUrl({
              courseTitle,
              lesson: {
                id: lesson.id,
                title: lesson.title,
                scheduledAt: new Date(lesson.startsAt),
                durationMinutes: lesson.durationMinutes ?? null,
              },
              pageUrl: `${window.location.origin}${sessionPagePath(courseId, lesson.id)}`,
              linkIsOnPage: labels.linkIsOnPage,
            });
            window.open(url, "_blank", "noopener,noreferrer");
          },
        },
        {
          value: "ics",
          label: labels.apple,
          icon: <Icon name="fileDownload" size="sm" />,
          onSelect: () => {
            void downloadIcs();
          },
        },
        {
          value: "subscribe",
          label: labels.subscribe,
          icon: <Icon name="repeat" size="sm" />,
          divided: true,
          onSelect: () => router.push("/account/calendar"),
        },
      ]}
    />
  );
}
