"use client";

import {
  AppleLogoIcon as AppleLogo,
  CalendarPlusIcon as CalendarPlus,
  GoogleLogoIcon as GoogleLogo,
} from "@medaris/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@medaris/ui/components/dropdown-menu";
import { cn } from "@medaris/ui/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import {
  type CalendarLesson,
  googleCalendarUrl,
  icsDownloadPath,
  sessionPagePath,
} from "../calendar-links";

/**
 * B10 "Takvime ekle" (MDRS-117): Google Calendar, or an .ics file for Apple
 * Calendar and Outlook. B10 is not in the design-system mirror yet
 * (MDRS-127), so this follows the page's existing outline-button pattern.
 */
export const AddToCalendarMenu = ({
  courseId,
  courseTitle,
  lesson,
  className,
}: {
  courseId: string;
  courseTitle: string;
  lesson: CalendarLesson;
  className?: string;
}) => {
  const t = useTranslations("tedris");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "mds-btn mds-btn--regular mds-btn--outline mds-btn--full",
            className
          )}
        >
          <CalendarPlus size={14} /> {t("AddToCalendar.button")}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {/* Rendered only while open, i.e. in the browser: the page origin is
            read here, so the server render never needs it. */}
        <CalendarMenuItems
          courseId={courseId}
          courseTitle={courseTitle}
          lesson={lesson}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const CalendarMenuItems = ({
  courseId,
  courseTitle,
  lesson,
}: {
  courseId: string;
  courseTitle: string;
  lesson: CalendarLesson;
}) => {
  const t = useTranslations("tedris");
  const locale = useLocale();
  const pageUrl = `${window.location.origin}${sessionPagePath(courseId, lesson.id)}`;

  return (
    <>
      <DropdownMenuItem asChild>
        <a
          href={googleCalendarUrl({
            courseTitle,
            lesson,
            pageUrl,
            linkIsOnPage: t("AddToCalendar.linkIsOnPage"),
          })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GoogleLogo size={16} /> {t("AddToCalendar.google")}
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={icsDownloadPath(lesson.id, locale)}>
          <AppleLogo size={16} /> {t("AddToCalendar.apple")}
        </a>
      </DropdownMenuItem>
    </>
  );
};
