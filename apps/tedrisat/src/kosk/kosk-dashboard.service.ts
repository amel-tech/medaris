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

const withoutEmail = ({
  studentEmail: _email,
  ...application
}: KoskDashboardApplicationResponse): KoskDashboardApplicationResponse =>
  application;

/**
 * A köşk nazımı's home page in one read (MDRS-182, nizam/02). The route is
 * authorized as the köşk's overview is (`kosk.manage`, or `platform.kosk_edit` for
 * a Medaris nazımı; the başnazım by the bypass). What the page carries beyond
 * the numbers is decided here (MDRS-135):
 *
 * - the meeting links and the applicants' e-mail addresses are for the köşk's
 *   own management (`kosk.manage`, the başnazım); `platform.kosk_edit` ("Köşkü
 *   düzenle, gizle ya da geri al") covers neither, so its holder gets the page
 *   without them (`contentLocked`);
 * - a course in a passive scope stays on the page for the köşk's nazımları
 *   (owner, 4 October: "köşk nazımı zaten bir tür platform yöneticisi") and
 *   for the platform's management holding `platform.inactive_scopes_manage`;
 *   everyone else gets the page without it;
 * - the applicants are a roster read and every link handed out is a content
 *   read: both go on the record before the page is returned, so a failed write
 *   fails the read (owner: "Kayıt alınsın"). The köşk-wide list belongs to no
 *   one course and is written on every read, as `GET /kosks/:id/enrollments/
 *   pending` is; a link is not written for a course the caller teaches.
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
      applications,
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
        ? applications.map(withoutEmail)
        : applications,
      muderris,
    };
  }

  /**
   * One row for the applicants (the köşk is its entity, as for the köşk-wide
   * pending list) and one `course.content_read` per course whose meeting link
   * the page hands out to someone who does not teach it.
   */
  private async recordReads(
    user: AuthenticatedUser,
    koskId: string,
    read: {
      applications: KoskDashboardApplicationResponse[];
      linked: KoskDashboardSessionResponse[];
      permission: string;
    }
  ): Promise<void> {
    const systemAdmin = this.authz.isSystemAdmin(user);
    const courses = new Map<string, string>();
    for (const s of read.linked) courses.set(s.courseId, s.courseTitle);
    const taught = await this.repo.taughtBy(user.sub, [...courses.keys()]);
    const entries: IAuditEntry[] = [
      {
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
      },
    ];
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
