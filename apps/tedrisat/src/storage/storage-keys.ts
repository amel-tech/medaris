import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREFIX = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The keys files are stored under (MDRS-287, MDRS-290, and the homework a
 * müderris sets on a celse). Built here and only here, from the
 * environment's prefix, ids tedrisat read from its own
 * database and a fresh random uuid: nothing a user typed — a file name
 * included — ever becomes part of a key, so no upload can name another
 * file's key, climb out of its folder or collide with one. The folders still
 * say whose a file is, which is what an operator browsing the zone needs:
 *
 *   <prefix>/courses/<courseId>/resources/<uuid>
 *   <prefix>/courses/<courseId>/lessons/<lessonId>/resources/<uuid>
 *   <prefix>/courses/<courseId>/lessons/<lessonId>/assignment/<uuid>
 *   <prefix>/courses/<courseId>/lessons/<lessonId>/submissions/<userId>/<uuid>
 *
 * Each part is checked again here, so a caller passing something else fails
 * loudly instead of writing to an unexpected place.
 */
function part(name: string, value: string, shape: RegExp): string {
  if (!shape.test(value)) {
    throw new Error(`storage key: ${name} has the wrong shape`);
  }
  return value;
}

const id = (name: string, value: string): string =>
  part(name, value.toLowerCase(), UUID);

/** A course's own resource file (MDRS-287). */
export function courseResourceKey(prefix: string, courseId: string): string {
  return [
    part("prefix", prefix, PREFIX),
    "courses",
    id("courseId", courseId),
    "resources",
    randomUUID(),
  ].join("/");
}

/** A celse's own resource file (MDRS-287). */
export function lessonResourceKey(
  prefix: string,
  courseId: string,
  lessonId: string
): string {
  return [
    part("prefix", prefix, PREFIX),
    "courses",
    id("courseId", courseId),
    "lessons",
    id("lessonId", lessonId),
    "resources",
    randomUUID(),
  ].join("/");
}

/** A file of a talebe's homework on a celse (MDRS-290). */
export function submissionFileKey(
  prefix: string,
  courseId: string,
  lessonId: string,
  userId: string
): string {
  return [
    part("prefix", prefix, PREFIX),
    "courses",
    id("courseId", courseId),
    "lessons",
    id("lessonId", lessonId),
    "submissions",
    id("userId", userId),
    randomUUID(),
  ].join("/");
}

/** A file of the homework a müderris set on a celse. */
export function lessonAssignmentFileKey(
  prefix: string,
  courseId: string,
  lessonId: string
): string {
  return [
    part("prefix", prefix, PREFIX),
    "courses",
    id("courseId", courseId),
    "lessons",
    id("lessonId", lessonId),
    "assignment",
    randomUUID(),
  ].join("/");
}
