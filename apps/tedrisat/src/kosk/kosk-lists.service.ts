import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import {
  ROSTER_READ_ACTION,
  type RosterRead,
} from "../course/domain/course-content";
import type {
  KoskRecordingListResponse,
  KoskSessionListResponse,
  KoskSessionTab,
  KoskStudentListResponse,
} from "./dto/kosk-lists.dto";
import { KoskService } from "./kosk.service";
import {
  type IKoskListFilter,
  KoskListsRepository,
} from "./kosk-lists.repository";

/** `details.via` of the talebe list's audit row. */
const VIA = "kosk-students" satisfies RosterRead;

interface IPaging {
  page: number;
  limit: number;
}

const slice = ({ page, limit }: IPaging) => ({
  limit,
  offset: (page - 1) * limit,
});

/**
 * The köşk-wide Celseler, Talebeler and Ders kayıtları of Nizam's köşk menu
 * (MDRS-211). The routes are authorized as the köşk's other menu pages are;
 * what is decided here is what the dashboard decides for the same köşk
 * (`KoskDashboardService`):
 *
 * - a course in a passive scope stays on the lists for the köşk's nazımları
 *   and for the platform's management holding
 *   `platform.inactive_scopes_manage`; everyone else gets them without it;
 * - the talebe list is a roster read and goes on the record before it is
 *   returned, so a failed write fails the read. It belongs to no one course,
 *   so the köşk is its entity, as for `GET /kosks/:id/enrollments/pending`.
 *
 * The sessions carry no meeting link and the ders kayıtları no address, so
 * neither is a content read: opening one is the course's own page's. What
 * else of them is course content is kept to the köşk's own management: how a
 * session is attended is left out for a `platform.kosk_edit` holder, and the
 * ders kayıtları, which the course rule would show them only in part, are
 * `kosk.manage`'s alone.
 */
@Injectable()
export class KoskListsService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: KoskListsRepository,
    private readonly authz: AuthzService,
    private readonly kosks: KoskService
  ) {}

  private async filter(
    koskId: string,
    user: AuthenticatedUser
  ): Promise<IKoskListFilter> {
    const [nazim, management] = await Promise.all([
      this.kosks.isManager(koskId, user.sub),
      this.authz.can(
        user,
        { entity: ENTITIES.KOSK, id: koskId },
        PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE
      ),
    ]);
    return { closePassive: !(nazim || management) };
  }

  async sessions(
    koskId: string,
    user: AuthenticatedUser,
    tab: KoskSessionTab,
    paging: IPaging
  ): Promise<KoskSessionListResponse> {
    const [filter, manages] = await Promise.all([
      this.filter(koskId, user),
      this.authz.can(
        user,
        { entity: ENTITIES.KOSK, id: koskId },
        PERMISSIONS.KOSK_MANAGE
      ),
    ]);
    const [counts, rows] = await Promise.all([
      this.repo.sessionCounts(koskId, filter),
      this.repo.sessions(koskId, tab, filter, slice(paging)),
    ]);
    // How a session is attended is course content, as the meeting link is
    // (MDRS-283): a `platform.kosk_edit` holder gets the rows without it,
    // as on the dashboard.
    const items = manages
      ? rows
      : rows.map(({ inPerson: _inPerson, ...row }) => row);
    return {
      items,
      total: tab === "UPCOMING" ? counts.upcoming : counts.past,
      page: paging.page,
      limit: paging.limit,
      upcomingCount: counts.upcoming,
      pastCount: counts.past,
    };
  }

  async students(
    koskId: string,
    user: AuthenticatedUser,
    q: string | undefined,
    paging: IPaging
  ): Promise<KoskStudentListResponse> {
    const filter = await this.filter(koskId, user);
    const [{ items, total }, pendingCount] = await Promise.all([
      this.repo.students(koskId, { ...filter, q }, slice(paging)),
      this.repo.pendingCount(koskId, filter),
    ]);
    await this.repo.record({
      actorId: user.sub,
      action: ROSTER_READ_ACTION,
      entity: ENTITIES.KOSK,
      entityId: koskId,
      details: {
        via: VIA,
        courseIds: [
          ...new Set(items.flatMap((s) => s.courses.map((c) => c.id))),
        ],
        systemAdmin: this.authz.isSystemAdmin(user),
        permission: PERMISSIONS.KOSK_MANAGE,
      },
    });
    return {
      items,
      total,
      page: paging.page,
      limit: paging.limit,
      pendingCount,
    };
  }

  async recordings(
    koskId: string,
    user: AuthenticatedUser,
    paging: IPaging
  ): Promise<KoskRecordingListResponse> {
    const filter = await this.filter(koskId, user);
    const { items, total } = await this.repo.recordings(
      koskId,
      filter,
      slice(paging)
    );
    return { items, total, page: paging.page, limit: paging.limit };
  }
}
