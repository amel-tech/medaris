import { AuthzService } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseRepository } from "../course/course.repository";
import { KoskService } from "../kosk/kosk.service";
import { MeResponse } from "./dto/me-response.dto";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UserSummaryResponse } from "./dto/user-summary-response.dto";
import { UserLookupForbiddenError } from "./errors/user-lookup-forbidden.error";
import { UserNotFoundError } from "./errors/user-not-found.error";
import { TokenClaims } from "./interfaces/token-claims.interface";
import { IUser, IUserSettings, UserRepository } from "./user.repository";
import { identityFromClaims } from "./user-identity";
import { UserSyncService } from "./user-sync.service";

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly userSync: UserSyncService,
    private readonly koskService: KoskService,
    private readonly courseRepo: CourseRepository,
    private readonly authz: AuthzService
  ) {}

  /**
   * The caller's profile and role summary. The interceptor has normally
   * written the row already; if that write failed (it is logged and
   * swallowed there), it is retried here, uncached, because this handler
   * cannot answer without it.
   */
  async getMe(claims: TokenClaims): Promise<MeResponse> {
    const user = await this.loadSelf(claims);
    const [manages, teaches] = await Promise.all([
      this.koskService.findManagedBy(user.id),
      this.courseRepo.findTaughtBy(user.id),
    ]);

    return {
      ...toProfile(user),
      roles: {
        systemAdmin: this.authz.isSystemAdmin(claims),
        // No medrese→nazır table exists in tedrisat yet; see
        // docs/migration/mdrs-104-users-table.md.
        nazirOf: [],
        manages,
        teaches,
      },
    };
  }

  async updateMe(claims: TokenClaims, dto: UpdateMeDto): Promise<MeResponse> {
    const user = await this.loadSelf(claims);
    const settings: IUserSettings = {};
    if (dto.timeZone !== undefined) settings.timeZone = dto.timeZone;
    if (dto.locale !== undefined) settings.locale = dto.locale;
    if (Object.keys(settings).length > 0) {
      await this.users.updateSettings(user.id, settings);
    }
    return this.getMe(claims);
  }

  /**
   * Exact e-mail lookup for the people who assign others to things
   * (MDRS-104): SYSTEM_ADMIN and köşk managers. Nazırs are named by the issue
   * as well; they are admitted once tedrisat can tell who one is.
   */
  async findByEmail(
    claims: TokenClaims,
    email: string
  ): Promise<UserSummaryResponse[]> {
    if (!(await this.mayLookUpUsers(claims))) {
      throw new UserLookupForbiddenError();
    }
    const user = await this.users.findByEmail(email);
    if (!user) return [];
    return [
      {
        id: user.id,
        givenName: user.givenName,
        familyName: user.familyName,
        email: user.email,
      },
    ];
  }

  private async mayLookUpUsers(claims: TokenClaims): Promise<boolean> {
    if (this.authz.isSystemAdmin(claims)) return true;
    // A non-UUID `sub` owns nothing, and would be a 22P02 against `owner_id`.
    const identity = identityFromClaims(claims);
    if (!identity) return false;
    return this.koskService.managesAny(identity.id);
  }

  private async loadSelf(claims: TokenClaims): Promise<IUser> {
    const identity = identityFromClaims(claims);
    if (!identity) throw new UserNotFoundError();

    const existing = await this.users.findById(identity.id);
    if (existing) return existing;

    await this.userSync.syncNow(identity);
    const created = await this.users.findById(identity.id);
    if (!created) throw new UserNotFoundError();
    return created;
  }
}

function toProfile(user: IUser): Omit<MeResponse, "roles"> {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    givenName: user.givenName,
    familyName: user.familyName,
    timeZone: user.timeZone,
    locale: user.locale,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
}
