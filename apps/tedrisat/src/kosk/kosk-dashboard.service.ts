import { Injectable } from "@nestjs/common";
import type {
  DashboardSessionTab,
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
  constructor(private readonly repo: KoskDashboardRepository) {}

  async get(
    koskId: string,
    viewerId: string,
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
        this.repo.givenNameOf(viewerId),
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
      latestApplications: applications,
      muderris,
    };
  }
}
