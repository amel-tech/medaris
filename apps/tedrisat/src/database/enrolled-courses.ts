import { and, eq, inArray, sql } from "drizzle-orm";
import type { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import type { DatabaseService } from "./database.service";
import { isPassiveScope } from "./role-assignments";
import { bans } from "./schema/ban.schema";
import { courses, enrollments } from "./schema/course.schema";
import { ASSIGNED_ROLES } from "./schema/role-assignment.schema";

/**
 * The ids of the courses `userId` is enrolled in with one of `statuses` and
 * is not barred from (MDRS-177). Every list built from "my courses' sessions"
 * (the calendar feed, Programım, the phone menu's next session) reads this, so
 * what "enrolled" means is written once: a pending request is not in it, and a
 * barred talebe's courses drop out until the ban lifts. A medrese-wide ban
 * (MDRS-187) is the one with a `madrasah_id`, which only it has.
 *
 * `excludePassive` is for the lists that hand out a live link: a course whose
 * müderris, köşk nazımı or başmüderris has gone is closed even to its
 * enrolled talebe (MDRS-136), so its sessions leave those lists too (review
 * M5). The profile page, which hands out nothing, leaves it off.
 */
export const enrolledCourseIds = (
  db: DatabaseService["db"],
  userId: string,
  statuses: EnrollmentStatus[],
  { excludePassive = false }: { excludePassive?: boolean } = {}
) =>
  db
    .select({ id: enrollments.courseId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        inArray(enrollments.status, statuses),
        excludePassive
          ? sql`not (${isPassiveScope(
              ASSIGNED_ROLES.MUDERRIS,
              enrollments.courseId
            )} or ${isPassiveScope(
              ASSIGNED_ROLES.KOSK_NAZIM,
              sql`(select ${courses.koskId} from ${courses} where ${courses.id} = ${enrollments.courseId})`
            )} or ${isPassiveScope(
              ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
              sql`(select ${courses.madrasahId} from ${courses} where ${courses.id} = ${enrollments.courseId})`
            )})`
          : undefined,
        sql`not exists (select 1 from ${bans} where ${bans.userId} = ${enrollments.userId} and ${bans.liftedAt} is null and ((${bans.scope} = 'COURSE' and ${bans.courseId} = ${enrollments.courseId}) or (${bans.scope} = 'KOSK' and ${bans.koskId} = (select ${courses.koskId} from ${courses} where ${courses.id} = ${enrollments.courseId})) or ${bans.madrasahId} = (select ${courses.madrasahId} from ${courses} where ${courses.id} = ${enrollments.courseId})))`
      )
    );
