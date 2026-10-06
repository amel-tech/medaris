import {
  CODES,
  type CoursePermissions,
  holds,
} from "~/features/account/course-permissions";
import type {
  BoxState,
  CourseSettingsControls,
  CourseSettingsValues,
} from "./course-settings";

/**
 * What the caller may change on Ders ayarları, from what they hold in the
 * course (`GET /courses/:id/my-permissions`). `PATCH /courses/:id` asks
 * `course.edit` at the route and the setting's own code inside it, so a
 * control is open only when both are held: none is offered that the route
 * would refuse. The two boxes ask `course.edit` and `course.settings`;
 * publishing asks `course.edit` and `course.publish`; the time zone
 * `course.edit`; the sample session `session.manage` (`PATCH /lessons/:id`).
 * The derived `setting.*` codes come with `course.settings` minus what a
 * policy closes: without `setting.approval_off` approval cannot be switched
 * off, so the box is held ticked (the enrolment waits anyway, MDRS-207);
 * without `setting.course_open` a closed course cannot be opened again, so
 * that box is held as it is, and an open course may still be closed. The
 * server page decides this and hands the form the answer: the form never
 * imports the permissions read.
 */
export function controlsOf(
  held: CoursePermissions,
  stored: Pick<CourseSettingsValues, "isClosed">
): CourseSettingsControls {
  const edit = holds(held, CODES.courseEdit);
  const settings = holds(held, CODES.courseSettings);
  const publish = holds(held, CODES.coursePublish);
  const open: BoxState = edit && settings ? "open" : "shown";
  const closed: BoxState =
    settings && stored.isClosed && !holds(held, CODES.settingCourseOpen)
      ? "locked"
      : open;
  const approval: BoxState =
    settings && !holds(held, CODES.settingApprovalOff) ? "locked" : open;
  const zone = edit;
  const sample = holds(held, CODES.sessionManage);
  return {
    closed,
    approval,
    zone,
    sample,
    publish: edit && publish,
    save: closed === "open" || approval === "open" || zone || sample,
    needsEdit: !edit && (settings || publish),
  };
}
