import type {
  BanResponse,
  CourseDetailResponse,
  MeResponse,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind the ban screens (nizam 41 and 42, MDRS-177): who may do
 * what, how a row reads, which refusal says what. No React and no I/O, so the
 * sentences and rules the designs show can be pinned by plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** Roles whose ban only Medaris administration lifts (the top of the ladder). */
const PLATFORM_ROLES = new Set(["MEDARIS_NAZIM", "SYSTEM_ADMIN"]);

/**
 * Whether the signed-in person may bar a whole köşk (nizam 41, "Köşkten de
 * yasakla"): the köşk's nazım and the başnazım. tedrisat checks it again; this
 * only decides whether the option is offered.
 */
export const mayBanWholeKosk = (
  me: Pick<MeResponse, "roles"> | null,
  koskId: string
): boolean =>
  Boolean(
    me &&
      (me.roles.systemAdmin || me.roles.manages.some((k) => k.id === koskId))
  );

/** True for a reason that is empty or only white space. */
export const isBlank = (text: string): boolean => text.trim().length === 0;

/** The longest reason tedrisat accepts (`BAN_REASON_MAX`). */
export const REASON_MAX = 500;

/** The words of a ban's banner role: "Müderris", or "Müderris (siz)" for the viewer. */
export function bannerRole(
  ban: Pick<BanResponse, "bannedRole" | "bannedBy">,
  viewerId: string | null,
  t: Messages
): string {
  const role = t(`roles.${ban.bannedRole}`);
  return viewerId && ban.bannedBy.id === viewerId ? t("you", { role }) : role;
}

/** Why a row has no "Yasağı kaldır": only Medaris administration, or a higher kademe than the viewer's. */
export function cannotLiftNote(
  ban: Pick<BanResponse, "bannedRole">,
  t: Messages
): string {
  return PLATFORM_ROLES.has(ban.bannedRole)
    ? t("platformOnly")
    : t("higherOnly");
}

const DAY_MS = 24 * 3_600_000;

/** A ban placed in the last 24 hours wears the "Yeni" badge. */
export const isRecent = (ban: Pick<BanResponse, "createdAt">, now: Date) =>
  now.getTime() - new Date(ban.createdAt).getTime() < DAY_MS;

/**
 * "Ders" or "Köşk", and what it names: the course, or the köşk (and where it
 * was widened from). `withKosk` adds the köşk's name under a course ban, as
 * the Medaris-wide list does (nizam 48: "ders · köşk · medrese").
 */
export function scopeParts(
  ban: Pick<
    BanResponse,
    "scope" | "courseTitle" | "madrasahName" | "extendedFromCourseTitle"
  >,
  koskName: string,
  t: Messages,
  withKosk = false
): { label: string; detail: string[] } {
  if (ban.scope === "COURSE") {
    return {
      label: t("scope.COURSE"),
      detail: [
        ban.courseTitle,
        withKosk ? koskName : null,
        ban.madrasahName,
      ].filter((x): x is string => Boolean(x)),
    };
  }
  return {
    label: t("scope.KOSK"),
    detail: [
      koskName,
      ban.extendedFromCourseTitle
        ? t("extendedFrom", { course: ban.extendedFromCourseTitle })
        : null,
    ].filter((x): x is string => Boolean(x)),
  };
}

type CodeMap = Record<string, string>;
const KNOWN: CodeMap = {
  BAN_FORBIDDEN: "errors.BAN_FORBIDDEN",
  BAN_LIFT_FORBIDDEN: "errors.BAN_LIFT_FORBIDDEN",
  BAN_ALREADY_LIFTED: "errors.BAN_ALREADY_LIFTED",
  BAN_NOT_FOUND: "errors.BAN_NOT_FOUND",
  BAN_TARGET_INVALID: "errors.BAN_TARGET_INVALID",
  AUTHZ_FORBIDDEN: "errors.AUTHZ_FORBIDDEN",
};

/** The `nizam.BansPage` key for a refusal's code, or the generic one. */
export function banErrorKey(errorBody: unknown): string {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? String((errorBody as { code: unknown }).code)
      : "";
  return KNOWN[code] ?? "errors.generic";
}

/** The scopes the Medaris-wide list can be narrowed to; "" is "Tümü". */
export const SCOPE_FILTERS = ["", "COURSE", "KOSK"] as const;
export type ScopeFilter = (typeof SCOPE_FILTERS)[number];

/** Narrows a chip's value to a known filter; anything else is "Tümü". */
export const asScopeFilter = (value: string | null): ScopeFilter =>
  (SCOPE_FILTERS as readonly string[]).includes(value ?? "")
    ? ((value ?? "") as ScopeFilter)
    : "";

/**
 * What a row of the Medaris-wide list offers (nizam 48): "Yasağı kaldır" where
 * the viewer's kademe reaches the ban's, "Yasağı genişlet" on an open course
 * ban nobody has widened yet. A köşk ban (the widest scope modelled) has no
 * widen, a lifted one nothing at all. The server decides both flags; this only
 * reads them.
 */
export function rowActions(
  ban: Pick<
    BanResponse,
    "scope" | "liftedAt" | "viewerMayLift" | "viewerMayExtend"
  >
): { lift: boolean; extend: boolean } {
  const open = ban.liftedAt === null || ban.liftedAt === undefined;
  return {
    lift: open && ban.viewerMayLift,
    extend: open && ban.scope === "COURSE" && ban.viewerMayExtend,
  };
}

/** The offset of the next page, or null when everything is loaded ("Daha fazla göster"). */
export const nextOffset = (loaded: number, total: number): number | null =>
  loaded < total ? loaded : null;

/**
 * The next live session still to come, which a barred talebe may know the
 * meeting link of (nizam 41, "Sıradaki celsenin toplantı bağlantısını
 * yenileyin"): earliest scheduled, not cancelled.
 */
export function nextSessionAt(
  course: Pick<CourseDetailResponse, "weeks"> | null,
  now: Date
): Date | null {
  let next: Date | null = null;
  for (const week of course?.weeks ?? []) {
    for (const lesson of week.lessons ?? []) {
      if (!lesson.scheduledAt || lesson.cancelledAt) continue;
      const at = new Date(lesson.scheduledAt);
      if (at <= now) continue;
      if (next === null || at < next) next = at;
    }
  }
  return next;
}
