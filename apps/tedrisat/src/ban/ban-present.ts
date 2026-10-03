import type {
  IBanList,
  IBanView,
  IMadrasahBanList,
  IMadrasahBanView,
} from "./ban.service";
import type { BanListResponse, BanResponse } from "./dto/ban.dto";
import type {
  MadrasahBanListResponse,
  MadrasahBanResponse,
} from "./dto/madrasah-ban.dto";

const person = (p: {
  id: string;
  name: string | null;
  email: string | null;
}) => ({
  id: p.id,
  name: p.name,
  email: p.email,
});

type SharedFields = Omit<BanResponse, "viewerMayExtend">;

const shared = (b: IBanView | IMadrasahBanView): SharedFields => ({
  id: b.id,
  user: person(b.user),
  scope: b.scope,
  koskId: b.koskId,
  courseId: b.courseId,
  courseTitle: b.courseTitle,
  madrasahName: b.madrasahName,
  extendedFromCourseId: b.extendedFromCourseId,
  extendedFromCourseTitle: b.extendedFromCourseTitle,
  reason: b.reason,
  bannedBy: person(b.bannerPerson),
  bannedRole: b.bannedRole,
  createdAt: b.createdAt,
  liftedAt: b.liftedAt,
  liftedBy: b.lifterPerson ? person(b.lifterPerson) : null,
  liftReason: b.liftReason,
  viewerMayLift: b.viewerMayLift,
});

export const presentBan = (b: IBanView): BanResponse => ({
  ...shared(b),
  viewerMayExtend: b.viewerMayExtend,
});

export const presentList = (list: IBanList): BanListResponse => ({
  items: list.items.map(presentBan),
  activeCount: list.activeCount,
  liftedCount: list.liftedCount,
  recentCount: list.recentCount,
});

export const presentMadrasahBan = (
  b: IMadrasahBanView
): MadrasahBanResponse => ({
  ...shared(b),
  viewerMayEscalate: b.viewerMayEscalate,
  viewerMayRequestPermanent: b.viewerMayRequestPermanent,
  permanentRequestedAt: b.permanentRequestedAt,
});

export const presentMadrasahBanList = (
  list: IMadrasahBanList
): MadrasahBanListResponse => ({
  items: list.items.map(presentMadrasahBan),
  activeCount: list.activeCount,
  liftedCount: list.liftedCount,
  recentCount: list.recentCount,
});
