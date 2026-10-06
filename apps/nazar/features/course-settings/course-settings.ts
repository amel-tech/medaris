import type {
  CourseDetailResponse,
  UpdateCourseDto,
} from "@medaris/services/tedrisat";

/**
 * Ders ayarları as rules: what the form holds, what Kaydet sends and which
 * sentence a refusal gets. Pure on purpose, so the page and the form have
 * nothing to decide. nizam's course settings (nizam 34,
 * `apps/nizam/features/courses/present.ts`) keep the same sample-session
 * rules; they are written again here, not imported across apps. Which
 * control the caller may change is `controlsOf` (`./controls`), kept apart
 * because this module goes to the browser with the form.
 */

/** What the form holds: the course's three fields and its sample session. */
export interface CourseSettingsValues {
  isClosed: boolean;
  requiresApproval: boolean;
  timeZone: string;
  /** the sample session's id; "" for none */
  sampleLessonId: string;
}

/** The sample session: the first session marked as a preview; "" for none. */
export function sampleOf(course: Pick<CourseDetailResponse, "weeks">): string {
  for (const week of course.weeks) {
    for (const lesson of week.lessons) if (lesson.isPreview) return lesson.id;
  }
  return "";
}

export interface SampleOption {
  /** "" for "Örnek ders yok" */
  value: string;
  weekNumber: number | null;
  title: string | null;
}

/** "Örnek ders": none, then every live session, in programme order. */
export function sampleOptions(
  course: Pick<CourseDetailResponse, "weeks">
): SampleOption[] {
  const options: SampleOption[] = [
    { value: "", weekNumber: null, title: null },
  ];
  for (const week of course.weeks) {
    for (const lesson of week.lessons) {
      if (lesson.type !== "LIVE") continue;
      options.push({
        value: lesson.id,
        weekNumber: week.weekNumber,
        title: lesson.title,
      });
    }
  }
  return options;
}

export const settingsOf = (
  course: Pick<
    CourseDetailResponse,
    "isClosed" | "requiresApproval" | "timeZone" | "weeks"
  >
): CourseSettingsValues => ({
  isClosed: course.isClosed,
  requiresApproval: course.requiresApproval,
  timeZone: course.timeZone,
  sampleLessonId: sampleOf(course),
});

/**
 * The body of `PATCH /courses/:id`: only the course's fields that differ from
 * what was read, never `null` and never `version` (the route takes none). A
 * PATCH counts every field it carries as a change, so an unchanged
 * `requiresApproval: false` under a policy would be refused (409): nothing
 * unchanged is sent. `null` when nothing differs. The sample session is not a
 * field of the course; it moves with its own writes.
 */
export function courseSettingsPatch(
  stored: CourseSettingsValues,
  draft: CourseSettingsValues
): UpdateCourseDto | null {
  const patch: UpdateCourseDto = {};
  if (draft.isClosed !== stored.isClosed) patch.isClosed = draft.isClosed;
  if (draft.requiresApproval !== stored.requiresApproval) {
    patch.requiresApproval = draft.requiresApproval;
  }
  if (draft.timeZone !== stored.timeZone) patch.timeZone = draft.timeZone;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Whether Kaydet has anything to send: a course field or the sample session. */
export const settingsDirty = (
  stored: CourseSettingsValues,
  draft: CourseSettingsValues
): boolean =>
  courseSettingsPatch(stored, draft) !== null ||
  draft.sampleLessonId !== stored.sampleLessonId;

/**
 * A box of the form: `open` may be changed; `shown` shows what is stored and
 * may not be changed; `locked` is held ticked by a policy and is never sent.
 */
export type BoxState = "open" | "shown" | "locked";

export interface CourseSettingsControls {
  /** "Kapalı ders" */
  closed: BoxState;
  /** "Kayıt onayı gereksin" */
  approval: BoxState;
  /** "Saat dilimi" may be changed */
  zone: boolean;
  /** "Örnek ders" may be changed */
  sample: boolean;
  /** "Yayımla" and "Taslağa çek" are drawn */
  publish: boolean;
  /** Kaydet and Vazgeç are drawn: at least one control may be changed */
  save: boolean;
  /** the caller holds a setting's own code but not `course.edit`, which the route asks first */
  needsEdit: boolean;
}

/** The message key (from the catalogue's root) of a refused write, from the API's code. */
export function courseSettingsErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "PLATFORM_POLICY_LOCKED":
      return "CourseSettings.errors.policy";
    case "COURSE_VERSION_CONFLICT":
      return "CourseSettings.errors.versionConflict";
    case "VALIDATION_ERROR":
      return "CourseSettings.errors.invalid";
    default:
      return "CourseSettings.errors.generic";
  }
}

/**
 * Where "Tanıtım sayfasını gör" goes: the course's public page in Tedris,
 * whose address is the app's `TEDRIS_URL`. Nazar is Turkish only, so the page
 * is the Turkish one. `null` when Tedris's address is not set.
 */
export function coursePageUrl(
  tedris: string | null | undefined,
  courseId: string
): string | null {
  if (!tedris) return null;
  return new URL(
    `/tr/courses/${encodeURIComponent(courseId)}`,
    tedris
  ).toString();
}
