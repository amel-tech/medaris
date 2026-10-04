import type {
  KoskResponse,
  MeResponse,
  TaughtCourseRef,
} from "@medaris/services/tedrisat";

/**
 * Which köşk-screen buttons nizam shows (MDRS-108): each one only to the
 * `GET /me` roles whose matrix row lets them call every route behind it, so
 * no visible button ends in a 403. tedrisat checks again on every call; this
 * only decides what is offered.
 *
 * The table these functions implement — button, routes, roles — lives in
 * `apps/tedrisat/test/unit/authz/nizam-kosk-buttons.spec.ts`, which pins it
 * against the matrix; `apps/nizam/test/kosk-abilities.spec.ts` pins these
 * functions against the same roles. Change the three together.
 *
 * Read from `/me`'s roles because that is all today's model offers. Role
 * model v2 (MDRS-142) gives `/me` effective permissions; these functions are
 * where nizam switches to them.
 */
type Me = Pick<MeResponse, "roles"> | null;
type KoskRef = Pick<KoskResponse, "id">;

const managesKosk = (me: NonNullable<Me>, koskId: string): boolean =>
  me.roles.manages.some((k) => k.id === koskId);

export interface KoskAbilities {
  /**
   * "Köşkü Düzenle" — kosk EDIT: the manager's alone. A medrese holds only a
   * hosting right in a köşk, which gives its nazırs no power over it
   * (MDRS-134).
   */
  edit: boolean;
  /**
   * "Yeni Ders Aç" — kosk MANAGE_COURSES to create, then course EDIT to plan
   * its sessions. A nazır holds the first but no course role, so it is the
   * manager's alone.
   */
  openCourse: boolean;
  /**
   * "Bekleyen talepler" — kosk MANAGE_COURSES to list, course
   * MANAGE_ENROLLMENTS to approve or reject: the manager's alone, for the same
   * reason.
   */
  reviewRequests: boolean;
}

const NOTHING: KoskAbilities = {
  edit: false,
  openCourse: false,
  reviewRequests: false,
};

export const koskAbilities = (me: Me, kosk: KoskRef): KoskAbilities => {
  if (!me) return NOTHING;
  const manager = me.roles.systemAdmin || managesKosk(me, kosk.id);
  return {
    edit: manager,
    openCourse: manager,
    reviewRequests: manager,
  };
};

/**
 * Whether a course card links to the course editor (course EDIT, and the
 * roster behind it, MANAGE_ENROLLMENTS): the köşk's manager or one of the
 * course's müderris.
 */
export const mayEditCourse = (
  me: Me,
  koskId: string,
  courseId: string
): boolean =>
  Boolean(
    me &&
      (me.roles.systemAdmin ||
        managesKosk(me, koskId) ||
        me.roles.teaches.some((c) => c.id === courseId))
  );

/**
 * The courses the caller teaches in köşks they do not manage. `?managedBy=me`
 * leaves those köşks off the list, so without this a müderris who manages
 * nothing would have no way left to reach their own course in nizam.
 */
export const taughtElsewhere = (me: Me): TaughtCourseRef[] =>
  me
    ? me.roles.teaches.filter((course) => !managesKosk(me, course.koskId))
    : [];

/**
 * What an empty köşk list says. A köşk manager is never sent to nazir — the
 * list is theirs, and empty only once they manage nothing. `nazir` is for a
 * caller whose roles are medrese ones: a nazır with no köşk of their own.
 * `nazirOf` lists the medreses the caller leads or is nazır of since MDRS-142
 * (from their live role assignments), so a nazır with no köşk gets `nazir`.
 */
export type KoskListEmptyState = "none" | "nazir";

export const koskListEmptyState = (me: Me): KoskListEmptyState =>
  me && me.roles.manages.length === 0 && me.roles.nazirOf.length > 0
    ? "nazir"
    : "none";

/**
 * "Yeni Köşk" — `POST /kosks` is SYSTEM_ADMIN only since 2026-10-02:
 * `CREATE_KOSK` is on no köşk row, so only the realm bypass passes, and a
 * köşk manager would get a 403.
 */
export const mayCreateKosk = (me: Me): boolean =>
  Boolean(me?.roles.systemAdmin);
