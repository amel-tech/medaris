import type {
  CourseDetailResponse,
  CreateLessonDto,
  ReplaceCourseDto,
} from "@medaris/services/tedrisat";
import { normalizeMeetingUrl } from "@medaris/utils";
import { TONE_HUE } from "~/features/kosks/admin-present";
import {
  type LessonDraft,
  lessonInstant,
  type ResourceDraft,
  type WeekDraft,
} from "./present";

/**
 * The whole-course body of "Kaydet" on the curriculum (nizam 54): what the form
 * holds, plus what it does not edit and a PUT would otherwise drop — the
 * müderris rows (unchanged, so a müderris may save). A week or a session left
 * out of `weeks` is hidden by the PUT, never deleted. A resource left out of
 * `resources` is removed: a link has nothing hanging off it (MDRS-279).
 */
export interface CurriculumEdit {
  title: string;
  description: string;
  tone: keyof typeof TONE_HUE;
  weeks: WeekDraft[];
  resources: ResourceDraft[];
}

const lessonBody = (draft: LessonDraft, timeZone: string): CreateLessonDto => {
  const url = normalizeMeetingUrl(draft.meetingUrl);
  const at = draft.cancelledAt
    ? draft.scheduledAtIso
    : (lessonInstant(draft, timeZone)?.toISOString() ?? draft.scheduledAtIso);
  return {
    ...(draft.id ? { id: draft.id } : {}),
    title: draft.title.trim(),
    type: draft.type as CreateLessonDto["type"],
    durationMinutes: draft.duration ? Number(draft.duration) : undefined,
    scheduledAt: at ? new Date(at) : undefined,
    // An emptied link or source line is sent as null: tedrisat clears the
    // column for null and leaves it alone for a missing key (MDRS-279).
    kaynak: (draft.kaynak.trim() || null) as unknown as string,
    meetingUrl: (url || null) as unknown as string,
    agenda: draft.agenda,
    isPreview: draft.isPreview,
  };
};

export function curriculumPayload(
  course: CourseDetailResponse,
  edit: CurriculumEdit
): ReplaceCourseDto {
  return {
    version: course.version,
    title: edit.title.trim(),
    description: edit.description.trim() || undefined,
    coverHue: TONE_HUE[edit.tone],
    weeks: edit.weeks.map((w) => ({
      ...(w.id ? { id: w.id } : {}),
      weekNumber: w.weekNumber,
      title: w.title.trim(),
      summary: w.summary.trim() || undefined,
      lessons: w.lessons.map((l) => lessonBody(l, course.timeZone)),
    })),
    muderris: course.muderris.map((m) => ({
      id: m.id,
      userId: m.userId ?? undefined,
      name: m.name,
      title: m.title ?? undefined,
      bio: m.bio ?? undefined,
      avatarHue: m.avatarHue,
    })),
    // In list order (tedrisat stores the order as sent); an emptied line is
    // null, which clears it, like a session's link.
    resources: edit.resources.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name.trim(),
      meta: (r.meta.trim() || null) as unknown as string,
      type: r.type ?? undefined,
      url: r.url.trim(),
    })),
  };
}
