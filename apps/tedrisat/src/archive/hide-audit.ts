import { eq } from "drizzle-orm";
import type { Tx } from "../course/course-purge";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import type { ArchiveItemType } from "./archive-types";
import type { HideLevel } from "./hide-level";

/**
 * The audit row of a hide or a restore (MDRS-143), one shape for all of them so
 * the audit page and what reads it later (the appeal and ban screens) need no
 * per-kind parsing. The row is written in the same transaction as the change.
 *
 * `action` is `<entity>.hide` or `<entity>.restore`, which the audit page's
 * "Gizleme" filter already lists (`AUDIT_TYPE_RULES.HIDE`). `details` always
 * carries the thing's `title` and the `level` the actor acted at; a restore adds
 * `hiddenLevel`, the level that hid it. `koskId`, `madrasahId`, `courseId` and
 * `weekId` say where it sat, whichever of them apply.
 */
export type HideAuditEntity =
  | "kosk"
  | "madrasah"
  | "course"
  | "week"
  | "lesson"
  | "deck";

/** A session is `lesson` in the audit log, as `lesson.cancel` already is. */
export const auditEntityOf = (type: ArchiveItemType): HideAuditEntity =>
  type === "session" ? "lesson" : (type as HideAuditEntity);

export interface IHideAuditEntry {
  actorId: string;
  verb: "hide" | "restore";
  entity: HideAuditEntity;
  entityId: string;
  title: string;
  /** The level the actor acted at. */
  level: HideLevel;
  /** On a restore: the level that hid it. */
  hiddenLevel?: HideLevel;
  koskId?: string | null;
  madrasahId?: string | null;
  courseId?: string | null;
  weekId?: string | null;
  /** Anything else worth keeping, such as how many sessions went with a week. */
  extra?: Record<string, unknown>;
}

export async function recordHide(
  tx: Tx,
  entry: IHideAuditEntry
): Promise<void> {
  const where: Record<string, string | null> = {};
  for (const key of ["koskId", "madrasahId", "courseId", "weekId"] as const) {
    const value = entry[key];
    if (value !== undefined) where[key] = value;
  }
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    action: `${entry.entity}.${entry.verb}`,
    entity: entry.entity,
    entityId: entry.entityId,
    details: {
      title: entry.title,
      level: entry.level,
      ...(entry.hiddenLevel ? { hiddenLevel: entry.hiddenLevel } : {}),
      ...where,
      ...entry.extra,
    },
  });
}

/** The köşk and medrese a course sits in, for the audit row of something inside it. */
export async function courseParents(
  tx: Tx,
  courseId: string
): Promise<{ koskId: string | null; madrasahId: string | null }> {
  const [row] = await tx
    .select({ koskId: courses.koskId, madrasahId: courses.madrasahId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return { koskId: row?.koskId ?? null, madrasahId: row?.madrasahId ?? null };
}
