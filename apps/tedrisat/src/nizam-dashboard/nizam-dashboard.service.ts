import { AuthzForbiddenError } from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import { AssignmentService } from "../assignment/assignment.service";
import { BanService } from "../ban/ban.service";
import { BanForbiddenError } from "../ban/errors/ban-errors";
import { InactiveScopeService } from "../inactive-scope/inactive-scope.service";
import { isSystemAdmin } from "../platform-access/platform-access.service";
import type { TokenClaims } from "../user/interfaces/token-claims.interface";
import { sectionsFor } from "./dashboard-sections";
import type {
  DashboardBanResponse,
  NizamDashboardResponse,
} from "./dto/nizam-dashboard.dto";
import { NizamDashboardRepository } from "./nizam-dashboard.repository";

/** Rows each card of the page lists. */
const CARD_ROWS = 3;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * The Medaris home page in one read (MDRS-182, nizam/01 and 05): the numbers,
 * what waits for a decision, and the newest rows of each queue. The başnazım
 * (SYSTEM_ADMIN) and a Medaris nazımı may read it; the nazımı's page is the
 * same read cut down to what their permissions open, so a count or a list the
 * viewer may not see is `null`, never zero.
 */
@Injectable()
export class NizamDashboardService {
  private readonly logger = new Logger(NizamDashboardService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: NizamDashboardRepository,
    private readonly assignments: AssignmentService,
    private readonly inactive: InactiveScopeService,
    private readonly bans: BanService
  ) {}

  async get(user: TokenClaims): Promise<NizamDashboardResponse> {
    const chief = isSystemAdmin(user);
    if (!chief && !(await this.repo.isMedarisNazim(user.sub))) {
      throw new AuthzForbiddenError(
        "Only the Medaris başnazımı and a Medaris nazımı open the Medaris home page"
      );
    }
    const held = chief
      ? new Set<string>()
      : new Set((await this.assignments.myPermissions(user)).permissions);
    const sections = sectionsFor(chief, held);

    const [numbers, applications, deckRequests, passive, latestBans, dbName] =
      await Promise.all([
        this.repo.platformNumbers(),
        sections.applications ? this.repo.applications(CARD_ROWS) : null,
        sections.deckRequests ? this.repo.deckRequests(CARD_ROWS) : null,
        this.inactive.brief(),
        sections.bans ? this.latestBans(user) : null,
        this.repo.givenNameOf(user.sub),
      ]);

    const passiveOf = (type: "KOSK" | "MADRASAH" | "COURSE") =>
      passive.filter((p) => p.type === type).length;

    return {
      viewer: chief ? "CHIEF" : "MEDARIS_NAZIM",
      greetingName: dbName ?? stringOrNull(user.given_name),
      can: { openKosk: sections.openKosk },
      pendingTotals: {
        koskApplications: applications?.count ?? null,
        deckPublishRequests: deckRequests?.count ?? null,
        // Appeals and permanent-ban requests have no model yet (nizam/44 and
        // 45 are a later phase): a viewer who would see them has none waiting.
        appeals: sections.appeals ? 0 : null,
        permanentBanRequests: sections.permanentBans ? 0 : null,
      },
      platformCounts: {
        kosk: numbers.kosk,
        unlistedKosk: numbers.unlistedKosk,
        madrasah: numbers.madrasah,
        inactiveMadrasah: passiveOf("MADRASAH"),
        course: sections.courseNumbers ? numbers.course : null,
        inactiveCourse: sections.courseNumbers ? passiveOf("COURSE") : null,
        enrolledStudents: sections.courseNumbers
          ? numbers.enrolledStudents
          : null,
      },
      latestApplications: applications?.latest ?? null,
      latestDeckRequests: deckRequests?.latest ?? null,
      inactiveScopes: sections.inactiveScopes
        ? passive.slice(0, CARD_ROWS).map((p) => ({
            type: p.type,
            id: p.id,
            name: p.name,
            koskName: p.koskName,
            reason: p.reason,
            since: p.since,
          }))
        : null,
      inactiveScopeCount: sections.inactiveScopes ? passive.length : null,
      latestBans,
    };
  }

  /** The newest open bans; a viewer the ban rules turn away has no card, not an error. */
  private async latestBans(
    user: TokenClaims
  ): Promise<DashboardBanResponse[] | null> {
    try {
      const { items } = await this.bans.listAll(user, {
        status: "ACTIVE",
        limit: CARD_ROWS,
        offset: 0,
      });
      return items.map((b) => ({
        id: b.id,
        userName: b.user.name ?? b.user.email,
        scope: b.scope,
        courseTitle: b.courseTitle,
        koskName: b.koskName,
        bannedByName: b.bannerPerson.name ?? b.bannerPerson.email,
        reason: b.reason,
        createdAt: b.createdAt,
      }));
    } catch (error) {
      if (error instanceof BanForbiddenError) return null;
      this.logger.warn(`The newest bans could not be read: ${String(error)}`);
      throw error;
    }
  }
}
