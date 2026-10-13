import { mapAccessTokenClaims } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { ProfileGender } from "../database/schema/user-profile.schema";
import {
  MyPublicProfileResponse,
  PublicProfileResponse,
  UpdatePublicProfileDto,
} from "./dto/public-profile.dto";
import { GenderManagedByAccountError } from "./errors/gender-managed-by-account.error";
import { KunyeTakenError } from "./errors/kunye-taken.error";
import { PublicProfileNotFoundError } from "./errors/profile-not-found.error";
import { UserNotFoundError } from "./errors/user-not-found.error";
import { TokenClaims } from "./interfaces/token-claims.interface";
import { UserRepository } from "./user.repository";
import { identityFromClaims } from "./user-identity";
import {
  IUserProfile,
  IUserProfilePatch,
  isUniqueViolation,
  UserProfileRepository,
} from "./user-profile.repository";
import { UserSyncService } from "./user-sync.service";

/** "" and whitespace are no value: clearing a text field stores null, not "". */
const blankToNull = (value: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * The public profile (MDRS-166, screen tedris/35). The künye and gender are
 * always visible; every other field is visible only while its switch is on.
 * `readPublic` is the one place that decides what leaves the server.
 *
 * The gender belongs to the account once the token carries it (#317): the
 * caller's own is read from the claim, a change through here is refused
 * (`GENDER_MANAGED_BY_ACCOUNT`), and `user_profiles.gender` is only the
 * mirror `UserSyncService` keeps, which `readPublic` reads for everyone else.
 * A token without the claim works as before: the gender is the profile's.
 */
@Injectable()
export class UserProfileService {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly users: UserRepository,
    private readonly userSync: UserSyncService
  ) {}

  async getMine(claims: TokenClaims): Promise<MyPublicProfileResponse> {
    const id = await this.ensureUser(claims);
    return this.toMine(id, accountGender(claims));
  }

  async updateMine(
    claims: TokenClaims,
    dto: UpdatePublicProfileDto
  ): Promise<MyPublicProfileResponse> {
    const account = accountGender(claims);
    // Refused before anything is written, so the request has one outcome:
    // none of its other fields is saved either. Sending the account's own
    // value is no change and passes (a page loaded before the claim arrived).
    if (account && dto.gender !== undefined && dto.gender !== account) {
      throw new GenderManagedByAccountError();
    }
    const id = await this.ensureUser(claims);
    const patch: IUserProfilePatch = {};
    if (dto.kunye !== undefined) patch.kunye = dto.kunye.trim();
    if (!account && dto.gender !== undefined) patch.gender = dto.gender;
    if (dto.city !== undefined) patch.city = blankToNull(dto.city);
    if (dto.about !== undefined) patch.about = blankToNull(dto.about);
    const v = dto.visibility;
    if (v?.fullName !== undefined) patch.showFullName = v.fullName;
    if (v?.city !== undefined) patch.showCity = v.city;
    if (v?.about !== undefined) patch.showAbout = v.about;
    if (v?.courses !== undefined) patch.showCourses = v.courses;

    if (Object.keys(patch).length > 0) {
      try {
        await this.profiles.upsert(id, patch);
      } catch (error) {
        if (isUniqueViolation(error)) throw new KunyeTakenError();
        throw error;
      }
    }
    return this.toMine(id, account);
  }

  /** What anyone signed in may see of `userId`; 404 until they have chosen a künye. */
  async readPublic(userId: string): Promise<PublicProfileResponse> {
    const profile = await this.profiles.findById(userId);
    if (!profile?.kunye) throw new PublicProfileNotFoundError(userId);
    const user = await this.users.findById(userId);

    const result: PublicProfileResponse = {
      id: userId,
      kunye: profile.kunye,
      gender: profile.gender,
    };
    if (profile.showFullName) {
      const name = fullName(profile, user);
      if (name) result.fullName = name;
    }
    if (profile.showCity && profile.city) result.city = profile.city;
    if (profile.showAbout && profile.about) result.about = profile.about;
    if (profile.showCourses) {
      result.courses = await this.profiles.courseTitles(userId);
    }
    return result;
  }

  private async toMine(
    userId: string,
    account: ProfileGender | undefined
  ): Promise<MyPublicProfileResponse> {
    const [profile, user, courseTitles] = await Promise.all([
      this.profiles.findById(userId),
      this.users.findById(userId),
      this.profiles.courseTitles(userId),
    ]);
    return {
      kunye: profile?.kunye ?? null,
      gender: account ?? profile?.gender ?? null,
      genderManagedByAccount: account !== undefined,
      city: profile?.city ?? null,
      about: profile?.about ?? null,
      fullName: fullName(profile, user),
      courses: courseTitles,
      visibility: {
        fullName: profile?.showFullName ?? false,
        city: profile?.showCity ?? false,
        about: profile?.showAbout ?? false,
        courses: profile?.showCourses ?? false,
      },
    };
  }

  private async ensureUser(claims: TokenClaims): Promise<string> {
    const identity = identityFromClaims(claims);
    if (!identity) throw new UserNotFoundError();
    if (!(await this.users.findById(identity.id))) {
      await this.userSync.syncNow(identity);
    }
    return identity.id;
  }
}

/** The gender the caller's token carries (#317), the one source of it when present. */
function accountGender(claims: TokenClaims): ProfileGender | undefined {
  return mapAccessTokenClaims(claims).gender;
}

function fullName(
  profile: IUserProfile | null,
  user: { givenName: string | null; familyName: string | null } | null
): string | null {
  const given = profile?.givenName ?? user?.givenName ?? "";
  const family = profile?.familyName ?? user?.familyName ?? "";
  return `${given} ${family}`.trim() || null;
}
