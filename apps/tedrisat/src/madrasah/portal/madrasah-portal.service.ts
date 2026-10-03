import { AuthenticatedUser, AuthzService } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import type { IMadrasahHostingKosk } from "../course/madrasah-course.repository.interface";
import { MadrasahCourseService } from "../course/madrasah-course.service";
import { MadrasahService } from "../madrasah.service";
import { MadrasahPortalRepository } from "./madrasah-portal.repository";
import type {
  IDashboardApplication,
  IDashboardSession,
  IMadrasahStudentFilter,
  IMadrasahStudentPage,
} from "./madrasah-portal.repository.interface";

/** The Pano's "Önümüzdeki 7 gün". */
const UPCOMING_DAYS = 7;
/** How many pending applications the Pano lists; the count above them is the whole. */
const PENDING_LIST_LIMIT = 50;

export interface IMadrasahDashboard {
  nazirCount: number;
  courseCount: number;
  hostingKosks: IMadrasahHostingKosk[];
  upcomingSessions: IDashboardSession[];
  pendingApplicationCount: number;
  pendingCourseCount: number;
  pendingApplications: (IDashboardApplication & { viewerMayDecide: boolean })[];
}

/**
 * What the nazır portal's talebe list (nazir/10) and Pano (nazir/01) show.
 * Reached through `MadrasahPortalController`, whose `@Authz` scope decides who
 * may call it — the medrese's başmüderris and SYSTEM_ADMIN; nothing here
 * re-checks the caller. The permission the catalogue names for the talebe list
 * (`madrasah.students_view`) is not read: grants are not enforced by
 * `AuthzGuard`.
 */
@Injectable()
export class MadrasahPortalService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: MadrasahPortalRepository,
    private readonly madrasahService: MadrasahService,
    private readonly courseService: MadrasahCourseService,
    private readonly authz: AuthzService
  ) {}

  /** A page of the medrese's talebe, with how many there are in all. */
  students(
    madrasahId: string,
    filter: IMadrasahStudentFilter,
    page: number,
    limit: number
  ): Promise<IMadrasahStudentPage> {
    return this.repo.findStudents(
      madrasahId,
      filter,
      limit,
      (page - 1) * limit
    );
  }

  /** Everything the Pano shows about the medrese, in one read. */
  async dashboard(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<IMadrasahDashboard> {
    const [
      nazirCount,
      courseCount,
      hostingKosks,
      upcomingSessions,
      badges,
      pending,
      deciding,
    ] = await Promise.all([
      this.repo.countNazirs(madrasahId),
      this.repo.countCourses(madrasahId),
      this.courseService.hostingKosks(madrasahId),
      this.repo.findUpcomingSessions(madrasahId, UPCOMING_DAYS),
      this.madrasahService.getBadgeCounts(madrasahId),
      this.repo.findPendingApplications(madrasahId, PENDING_LIST_LIMIT),
      this.repo.decidingScopes(user.sub),
    ]);
    const admin = this.authz.isSystemAdmin(user);
    return {
      nazirCount,
      courseCount,
      hostingKosks,
      upcomingSessions,
      pendingApplicationCount: badges.pendingApplications,
      pendingCourseCount: badges.coursesWithPendingApplications,
      pendingApplications: pending.map((p) => ({
        ...p,
        viewerMayDecide:
          admin ||
          deciding.courseIds.has(p.courseId) ||
          deciding.koskIds.has(p.koskId),
      })),
    };
  }
}
