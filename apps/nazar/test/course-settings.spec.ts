import { describe, expect, it } from "vitest";
import { controlsOf } from "~/features/course-settings/controls";
import {
  type CourseSettingsValues,
  coursePageUrl,
  courseSettingsErrorKey,
  courseSettingsPatch,
  sampleOf,
  sampleOptions,
  settingsDirty,
  settingsOf,
} from "~/features/course-settings/course-settings";

/**
 * Ders ayarları as rules (MDRS-270): what Kaydet sends, what the caller may
 * change from what they hold in the course, the sample session and the
 * sentence a refusal gets. `PATCH /courses/:id` asks `course.edit` at the
 * route and the setting's own code inside it, so a control is open only when
 * both are held.
 */
const stored: CourseSettingsValues = {
  isClosed: false,
  requiresApproval: true,
  timeZone: "Europe/Istanbul",
  sampleLessonId: "l-2",
};

const lesson = (id: string, title: string, over = {}) => ({
  id,
  title,
  type: "LIVE",
  isPreview: false,
  ...over,
});

const course = (over: Record<string, unknown> = {}) =>
  ({
    isClosed: false,
    requiresApproval: true,
    timeZone: "Europe/Istanbul",
    weeks: [
      {
        weekNumber: 1,
        lessons: [
          lesson("l-1", "Celse 1"),
          lesson("l-v", "Okuma", { type: "VIDEO" }),
          lesson("l-2", "Celse 2", { isPreview: true }),
        ],
      },
      { weekNumber: 2, lessons: [lesson("l-3", "Celse 3")] },
    ],
    ...over,
  }) as never;

const holding = (...codes: string[]) => new Set(codes);

describe("what Kaydet sends to PATCH /courses/:id", () => {
  it("is nothing while nothing differs", () => {
    expect(courseSettingsPatch(stored, { ...stored })).toBeNull();
    expect(settingsDirty(stored, { ...stored })).toBe(false);
  });

  it("is only the fields that changed, never null and never a version", () => {
    expect(courseSettingsPatch(stored, { ...stored, isClosed: true })).toEqual({
      isClosed: true,
    });
    expect(
      courseSettingsPatch(stored, { ...stored, requiresApproval: false })
    ).toEqual({ requiresApproval: false });
    const all = courseSettingsPatch(stored, {
      isClosed: true,
      requiresApproval: false,
      timeZone: "Europe/Berlin",
      sampleLessonId: "l-2",
    });
    expect(all).toEqual({
      isClosed: true,
      requiresApproval: false,
      timeZone: "Europe/Berlin",
    });
    expect(Object.values(all ?? {})).not.toContain(null);
    expect(all).not.toHaveProperty("version");
  });

  it("leaves the sample session out of the course's body, but counts it as a change", () => {
    const draft = { ...stored, sampleLessonId: "l-3" };
    expect(courseSettingsPatch(stored, draft)).toBeNull();
    expect(settingsDirty(stored, draft)).toBe(true);
  });

  it("sends nothing when a box is ticked and unticked again before saving", () => {
    const ticked = { ...stored, isClosed: true };
    expect(courseSettingsPatch(stored, { ...ticked, isClosed: false })).toBe(
      null
    );
  });
});

describe("what the caller may change (controlsOf)", () => {
  it("opens every control to a holder of course.edit, course.settings, course.publish, session.manage and the setting codes", () => {
    const controls = controlsOf(
      holding(
        "course.edit",
        "course.settings",
        "course.publish",
        "session.manage",
        "setting.approval_off",
        "setting.course_open"
      ),
      stored
    );
    expect(controls).toEqual({
      closed: "open",
      approval: "open",
      zone: true,
      sample: true,
      publish: true,
      save: true,
      needsEdit: false,
    });
  });

  it("opens neither box to course.edit alone, but the time zone, and draws no publishing", () => {
    const controls = controlsOf(holding("course.edit"), stored);
    expect(controls.closed).toBe("shown");
    expect(controls.approval).toBe("shown");
    expect(controls.zone).toBe(true);
    expect(controls.publish).toBe(false);
    expect(controls.save).toBe(true);
  });

  it("opens nothing to course.settings without course.edit, which the route asks first, and says so", () => {
    const controls = controlsOf(
      holding("course.settings", "setting.approval_off", "setting.course_open"),
      stored
    );
    expect(controls).toMatchObject({
      closed: "shown",
      approval: "shown",
      zone: false,
      sample: false,
      save: false,
      needsEdit: true,
    });
  });

  it("draws no publishing for course.publish without course.edit, and says what is missing", () => {
    const controls = controlsOf(holding("course.publish"), stored);
    expect(controls.publish).toBe(false);
    expect(controls.needsEdit).toBe(true);
    expect(controls.save).toBe(false);
  });

  it("holds 'Kayıt onayı gereksin' ticked when a policy closes switching it off", () => {
    const held = holding(
      "course.edit",
      "course.settings",
      "setting.course_open"
    );
    expect(controlsOf(held, stored).approval).toBe("locked");
    // the other box stays open, and so does everything else
    expect(controlsOf(held, stored).closed).toBe("open");
    expect(controlsOf(held, stored).save).toBe(true);
  });

  it("holds a closed course closed when the medrese's policy closes opening it, and lets an open one be closed", () => {
    const held = holding(
      "course.edit",
      "course.settings",
      "setting.approval_off"
    );
    expect(controlsOf(held, { ...stored, isClosed: true }).closed).toBe(
      "locked"
    );
    expect(controlsOf(held, { ...stored, isClosed: false }).closed).toBe(
      "open"
    );
  });

  it("opens the sample session to session.manage alone, and nothing else", () => {
    const controls = controlsOf(holding("session.manage"), stored);
    expect(controls).toMatchObject({
      closed: "shown",
      approval: "shown",
      zone: false,
      sample: true,
      publish: false,
      save: true,
      needsEdit: false,
    });
  });

  it("opens nothing to a caller who holds none of the page's codes", () => {
    expect(controlsOf(holding("course.view_details"), stored)).toEqual({
      closed: "shown",
      approval: "shown",
      zone: false,
      sample: false,
      publish: false,
      save: false,
      needsEdit: false,
    });
  });
});

describe("the sample session", () => {
  it("is the session marked as a preview, or none", () => {
    expect(sampleOf(course())).toBe("l-2");
    expect(sampleOf(course({ weeks: [] }))).toBe("");
  });

  it("offers none, then every live session in programme order", () => {
    expect(sampleOptions(course())).toEqual([
      { value: "", weekNumber: null, title: null },
      { value: "l-1", weekNumber: 1, title: "Celse 1" },
      { value: "l-2", weekNumber: 1, title: "Celse 2" },
      { value: "l-3", weekNumber: 2, title: "Celse 3" },
    ]);
  });

  it("is read into the form with the course's own fields", () => {
    expect(settingsOf(course({ isClosed: true }))).toEqual({
      isClosed: true,
      requiresApproval: true,
      timeZone: "Europe/Istanbul",
      sampleLessonId: "l-2",
    });
  });
});

describe("a refused save", () => {
  it("is worded from the API's code, not from its message", () => {
    expect(courseSettingsErrorKey("AUTHZ_FORBIDDEN")).toBe(
      "Problems.actionForbidden"
    );
    expect(courseSettingsErrorKey("PLATFORM_POLICY_LOCKED")).toBe(
      "CourseSettings.errors.policy"
    );
    expect(courseSettingsErrorKey("COURSE_VERSION_CONFLICT")).toBe(
      "CourseSettings.errors.versionConflict"
    );
    expect(courseSettingsErrorKey("VALIDATION_ERROR")).toBe(
      "CourseSettings.errors.invalid"
    );
    expect(courseSettingsErrorKey("")).toBe("CourseSettings.errors.generic");
    expect(courseSettingsErrorKey("SOMETHING_NEW")).toBe(
      "CourseSettings.errors.generic"
    );
  });
});

describe("the link to the course's page", () => {
  it("is Tedris's Turkish course page, and absent when Tedris's address is not set", () => {
    expect(coursePageUrl("https://tedris.medaris.org", "c-1")).toBe(
      "https://tedris.medaris.org/tr/courses/c-1"
    );
    expect(coursePageUrl("", "c-1")).toBeNull();
    expect(coursePageUrl(undefined, "c-1")).toBeNull();
  });
});
