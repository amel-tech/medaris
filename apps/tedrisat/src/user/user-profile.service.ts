import { Injectable } from "@nestjs/common";
import {
  MyPublicProfileResponse,
  PublicProfileResponse,
  UpdatePublicProfileDto,
} from "./dto/public-profile.dto";
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
    return this.toMine(id);
  }

  async updateMine(
    claims: TokenClaims,
    dto: UpdatePublicProfileDto
  ): Promise<MyPublicProfileResponse> {
    const id = await this.ensureUser(claims);
    const patch: IUserProfilePatch = {};
    if (dto.kunye !== undefined) patch.kunye = dto.kunye.trim();
    if (dto.gender !== undefined) patch.gender = dto.gender;
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
    return this.toMine(id);
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

  private async toMine(userId: string): Promise<MyPublicProfileResponse> {
    const [profile, user, courseTitles] = await Promise.all([
      this.profiles.findById(userId),
      this.users.findById(userId),
      this.profiles.courseTitles(userId),
    ]);
    return {
      kunye: profile?.kunye ?? null,
      gender: profile?.gender ?? null,
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

function fullName(
  profile: IUserProfile | null,
  user: { givenName: string | null; familyName: string | null } | null
): string | null {
  const given = profile?.givenName ?? user?.givenName ?? "";
  const family = profile?.familyName ?? user?.familyName ?? "";
  return `${given} ${family}`.trim() || null;
}
