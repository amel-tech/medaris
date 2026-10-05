import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import type { IAuditEntry } from "../audit/audit.repository";
import {
  ROSTER_READ_ACTION,
  type RosterRead,
} from "../course/domain/course-content";
import type {
  DashboardSessionTab,
  KoskDashboardApplicationResponse,
  KoskDashboardResponse,
  KoskDashboardSessionResponse,
} from "./dto/kosk-dashboard.dto";
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import { KoskService } from "./kosk.service";
import { KoskDashboardRepository } from "./kosk-dashboard.repository";

/** Applications the home page's table lists. */
const APPLICATION_ROWS = 5;

/** `details.via` of the page's audit rows. */
const VIA = "kosk-dashboard" satisfies RosterRead;

const withoutLink = ({
  meetingUrl: _link,
  ...session
}: KoskDashboardSessionResponse): KoskDashboardSessionResponse => session;

/**
 * A köşk nazımı's home page in one read (MDRS-182, nizam/02). The route is
 * authorized as the köşk's overview is (`kosk.manage`, or `platform.kosk_edit` for
 * a Medaris nazımı; the başnazım by the bypass). What the page carries beyond
 * the numbers is decided here (MDRS-135):
 *
 * - the meeting links and the applicants are for the köşk's own management
 *   (`kosk.manage`, the başnazım); `platform.kosk_edit` ("Köşkü düzenle, gizle
 *   ya da geri al") covers neither content nor personal data, so its holder
 *   gets the page without them (`contentLocked`): the numbers stay, the
 *   applicants' names, accounts and e-mail addresses do not, exactly as
 *   `GET /kosks/:id/enrollments/pending` refuses them;
 * - a course in a passive scope stays on the page for the köşk's nazımları
 *   (owner, 4 October: "köşk nazımı zaten bir tür platform yöneticisi") and
 *   for the platform's management holding `platform.inactive_scopes_manage`;
 *   everyone else gets the page without it;
 * - the applicants are a roster read and every link handed out is a content
 *   read: both go on the record before the page is returned, so a failed write
 *   fails the read (owner: "Kayıt alınsın"). The köşk-wide list belongs to no
 *   one course and is written on every read that hands it out, as `GET
 *   /kosks/:id/enrollments/pending` is; a link is not written as a content
 *   read for a course the caller teaches. A link of a course in a passive
 *   scope also writes the `scope.passive_open` the engine writes for the same
 *   open.
 */
@Injectable()
export class KoskDashboardService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: KoskDashboardRepository,
    private readonly authz: AuthzService,
    private readonly kosks: KoskService
  ) {}

  async get(
    koskId: string,
    user: AuthenticatedUser,
    tab: DashboardSessionTab
  ): Promise<KoskDashboardResponse> {
    const koskName = await this.repo.koskName(koskId);
    if (koskName === null) throw new KoskNotFoundError(koskId);
    const kosk = { entity: ENTITIES.KOSK, id: koskId };
    const [manages, nazim, management] = await Promise.all([
      this.authz.can(user, kosk, PERMISSIONS.KOSK_MANAGE),
      this.kosks.isManager(koskId, user.sub),
      this.authz.can(user, kosk, PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE),
    ]);
    const contentLocked = !manages;
    const passive = { closePassive: !(nazim || management) };

    const [numbers, sessions, firstMissing, applications, muderris, name] =
      await Promise.all([
        this.repo.numbers(koskId, passive),
        this.repo.sessions(koskId, tab, passive),
        this.repo.sessions(koskId, "UPCOMING", {
          onlyMissingLink: true,
          limit: 1,
          ...passive,
        }),
        this.repo.latestApplications(koskId, APPLICATION_ROWS, passive),
        this.repo.muderris(koskId),
        this.repo.givenNameOf(user.sub),
      ]);

    await this.recordReads(user, koskId, {
      applications: contentLocked ? null : applications,
      linked: contentLocked ? [] : sessions.filter((s) => s.meetingUrl),
      permission: manages
        ? PERMISSIONS.KOSK_MANAGE
        : PERMISSIONS.PLATFORM_KOSK_EDIT,
    });

    const shown = contentLocked
      ? withoutLink
      : (s: KoskDashboardSessionResponse) => s;
    const missing = firstMissing[0];
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
      firstMissingLink: missing ? shown(missing) : null,
      tab,
      contentLocked,
      sessions: sessions.map(shown),
      latestApplications: contentLocked
        ? []
        : await this.withDecision(user, applications),
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

  /**
   * One row for the applicants when the page hands them out (the köşk is its
   * entity, as for the köşk-wide pending list), one `course.content_read` per
   * course whose meeting link the page hands out to someone who does not teach
   * it, and one `scope.passive_open` per such course in a passive scope.
   */
  private async recordReads(
    user: AuthenticatedUser,
    koskId: string,
    read: {
      /** Null when the page leaves the applicants out. */
      applications: Pick<KoskDashboardApplicationResponse, "courseId">[] | null;
      linked: KoskDashboardSessionResponse[];
      permission: string;
    }
  ): Promise<void> {
    const systemAdmin = this.authz.isSystemAdmin(user);
    const courses = new Map<string, string>();
    for (const s of read.linked) courses.set(s.courseId, s.courseTitle);
    const [taught, passive] = await Promise.all([
      this.repo.taughtBy(user.sub, [...courses.keys()]),
      this.repo.passiveScopesOf([...courses.keys()]),
    ]);
    const entries: IAuditEntry[] = [];
    if (read.applications) {
      entries.push({
        actorId: user.sub,
        action: ROSTER_READ_ACTION,
        entity: ENTITIES.KOSK,
        entityId: koskId,
        details: {
          via: VIA,
          courseIds: [...new Set(read.applications.map((a) => a.courseId))],
          systemAdmin,
          permission: read.permission,
        },
      });
    }
    for (const [courseId, passiveScope] of passive) {
      entries.push({
        actorId: user.sub,
        action: "scope.passive_open",
        entity: ENTITIES.COURSE,
        entityId: courseId,
        details: {
          passiveScope,
          permission: PERMISSIONS.SESSION_LIVE_LINK,
          via: VIA,
        },
      });
    }
    for (const [courseId, title] of courses) {
      if (taught.has(courseId)) continue;
      entries.push({
        actorId: user.sub,
        action: "course.content_read",
        entity: ENTITIES.COURSE,
        entityId: courseId,
        details: {
          title,
          via: VIA,
          systemAdmin,
          permission: read.permission,
        },
      });
    }
    await this.repo.record(entries);
  }
}
