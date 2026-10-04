import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import type {
  DashboardSessionTab,
  KoskDashboardApplicationResponse,
  KoskDashboardResponse,
} from "./dto/kosk-dashboard.dto";
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import { KoskDashboardRepository } from "./kosk-dashboard.repository";

/** Applications the home page's table lists. */
const APPLICATION_ROWS = 5;

/**
 * A köşk nazımı's home page in one read (MDRS-182, nizam/02). The route is
 * authorized as the köşk's overview is (`kosk.manage`, or `platform.kosk_edit` for
 * a Medaris nazımı; the başnazım by the bypass), so this class only reads.
 */
@Injectable()
export class KoskDashboardService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(
    private readonly repo: KoskDashboardRepository,
    private readonly authz: AuthzService
  ) {}

  async get(
    koskId: string,
    viewer: AuthenticatedUser,
    tab: DashboardSessionTab
  ): Promise<KoskDashboardResponse> {
    const koskName = await this.repo.koskName(koskId);
    if (koskName === null) throw new KoskNotFoundError(koskId);
    const [numbers, sessions, firstMissing, applications, muderris, name] =
      await Promise.all([
        this.repo.numbers(koskId),
        this.repo.sessions(koskId, tab),
        this.repo.sessions(koskId, "UPCOMING", {
          onlyMissingLink: true,
          limit: 1,
        }),
        this.repo.latestApplications(koskId, APPLICATION_ROWS),
        this.repo.muderris(koskId),
        this.repo.givenNameOf(viewer.sub),
      ]);
    return {
      koskId,
      koskName,
      greetingName: name,
      counts: {
        courses: numbers.courses,
        students: numbers.students,
        upcomingSessions: numbers.upcoming,
        pendingApplications: numbers.pendingApplications,
      },
      sessionCounts: {
        upcoming: numbers.upcoming,
        past: numbers.past,
        cancelled: numbers.cancelled,
      },
      missingLinkCount: numbers.missingLink,
      firstMissingLink: firstMissing[0] ?? null,
      tab,
      sessions,
      latestApplications: await this.withDecision(viewer, applications),
      muderris,
    };
  }

  /**
   * Each application with the engine's answer for the viewer on its course, so
   * the screen offers Onayla and Reddet only where the route would not refuse
   * them. A passive scope closes `enrollment.decide` to everyone but platform
   * management (the başnazım's bypass included), and a Medaris nazımı with no
   * course work never held it; asking `AuthzService` keeps that one rule.
   * `effective` writes no audit row: nothing is opened by looking.
   */
  private async withDecision(
    viewer: AuthenticatedUser,
    rows: Omit<KoskDashboardApplicationResponse, "canDecide">[]
  ): Promise<KoskDashboardApplicationResponse[]> {
    const admin = this.authz.isSystemAdmin(viewer);
    const decide = new Map<string, boolean>();
    for (const { courseId } of rows) {
      if (decide.has(courseId)) continue;
      const held = admin
        ? true
        : ((
            await this.authz.effective(viewer, {
              entity: ENTITIES.COURSE,
              id: courseId,
            })
          )?.codes.has(PERMISSIONS.ENROLLMENT_DECIDE) ?? false);
      decide.set(courseId, held);
    }
    return rows.map((row) => ({
      ...row,
      canDecide: decide.get(row.courseId) ?? false,
    }));
  }
}
