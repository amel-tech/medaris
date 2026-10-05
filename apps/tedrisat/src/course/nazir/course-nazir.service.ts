import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  RELATIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import {
  GrantExpiryInvalidError,
  UnknownPermissionError,
} from "../../assignment/admin/errors";
import { checkGrantExpiry } from "../../assignment/admin/grant-plan";
import type { IPersonName } from "../../assignment/assignment.repository";
import { COURSE_CATALOG } from "../../assignment/permission-catalog";
import { UserDirectoryService } from "../../assignment/user-directory.service";
import { TedrisatAuthzContext } from "../../authz/tedrisat-authz-context.service";
import { BanService } from "../../ban/ban.service";
import { SCOPE_TYPES } from "../../database/schema/role-assignment.schema";
import type { KoskPersonResponse } from "../../kosk/dto/kosk-admin.dto";
import {
  GrantCourseInvalidError,
  GrantExceedsGiverError,
} from "../../kosk/errors/kosk-grants-errors";
import { checkRequestedCodes } from "../../kosk/kosk-grants-rules";
import { PermissionNotGivableError } from "../../madrasah/errors/permission-not-givable.error";
import { CourseService } from "../course.service";
import { CourseNazirRepository } from "./course-nazir.repository";
import {
  CourseNazirBarredError,
  CourseNazirUnknownAccountError,
} from "./course-nazir-errors";
import { type CourseStanding, courseStandingOf } from "./course-standing";
import type {
  CourseNazirsResponse,
  CreateCourseNazirDto,
  UpdateCourseNazirDto,
} from "./dto/course-nazir.dto";

const MEDRESE_STAFF_APPOINT =
  "In a medrese course its own staff appoint ders nazırları";
const APPOINTS_ONLY =
  "Holding course_nazir.assign by a grant appoints; it gives nothing";

/** The catalog's order, codes outside it last: how the list prints a post's codes. */
const inCatalogOrder = (codes: readonly string[]): string[] => {
  const at = (code: string) => {
    const i = COURSE_CATALOG.indexOf(code as (typeof COURSE_CATALOG)[number]);
    return i < 0 ? COURSE_CATALOG.length : i;
  };
  return [...codes].sort((a, b) => at(a) - at(b));
};

function personOf(
  id: string,
  people: Map<string, IPersonName>
): KoskPersonResponse {
  const person = people.get(id);
  const name = [person?.givenName, person?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { id, name: name || null, email: person?.email ?? null };
}

/**
 * A course's ders nazırları, from the course itself (MDRS-270): the müderris,
 * the medrese's başmüderris in a medrese course, the köşk nazımı in a köşk's
 * own course and the başnazım appoint, give (none beyond what they hold
 * there), change and end; whoever holds `course_nazir.assign` by a grant only
 * appoints with no permission and ends the posts they appointed. The route's
 * `@Authz(course_nazir.assign)` decides who may come in; `standing` decides
 * what each may do once in, from the engine's own computation.
 */
@Injectable()
export class CourseNazirService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: CourseNazirRepository,
    private readonly courses: CourseService,
    private readonly authz: AuthzService,
    private readonly context: TedrisatAuthzContext,
    private readonly directory: UserDirectoryService,
    private readonly bans: BanService
  ) {}

  /** Where the caller stands here: the başnazım gives as the platform. */
  async standing(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<CourseStanding> {
    if (this.authz.isSystemAdmin(user)) {
      return { kind: "giver", authority: SCOPE_TYPES.PLATFORM };
    }
    const ctx = await this.context.load(user.sub, {
      entity: ENTITIES.COURSE,
      id: courseId,
    });
    // Neither code is a relationship's, so the caller's relation to the
    // course changes nothing here.
    return courseStandingOf(
      {
        entity: ENTITIES.COURSE,
        relation: RELATIONS.PUBLIC,
        chain: ctx.chain,
        madrasahCourse: ctx.madrasahCourse,
        passiveScope: ctx.passiveScope,
        policies: ctx.policies,
      },
      ctx.roles,
      ctx.grants
    );
  }

  /**
   * The codes the caller may hand on here (owner, d-1004-27 "tavan kazanır"):
   * the catalog's codes they hold in this course now, so a policy, a passive
   * course or a medrese course cuts what they give as it cuts what they do.
   * The başnazım hands on the whole catalog; one who appoints only, nothing.
   */
  private async ceiling(
    user: AuthenticatedUser,
    courseId: string,
    standing: CourseStanding
  ): Promise<readonly string[]> {
    if (standing.kind !== "giver") return [];
    if (this.authz.isSystemAdmin(user)) return COURSE_CATALOG;
    const held = (
      await this.authz.effective(user, {
        entity: ENTITIES.COURSE,
        id: courseId,
      })
    )?.codes;
    return COURSE_CATALOG.filter((code) => held?.has(code));
  }

  async list(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<CourseNazirsResponse> {
    const course = await this.courses.getDetail(courseId, user);
    const standing = await this.standing(user, courseId);
    const grantable = await this.ceiling(user, courseId, standing);
    const posts = await this.repo.heldPosts(courseId);
    const [codes, people] = await Promise.all([
      this.repo.heldCodes([...new Set(posts.map((p) => p.userId))], courseId),
      this.directory.resolvePeople(
        posts.flatMap((p) => [p.userId, p.grantedBy])
      ),
    ]);
    const me = user.sub.toLowerCase();
    const admin = this.authz.isSystemAdmin(user);
    const giver = standing.kind === "giver";
    return {
      course: {
        id: course.id,
        title: course.title,
        madrasahName: course.madrasah?.name ?? null,
      },
      items: posts.map((p) => ({
        id: p.id,
        user: personOf(p.userId, people),
        permissions: inCatalogOrder(codes.get(p.userId) ?? []),
        endsAt: p.endsAt,
        grantedBy: personOf(p.grantedBy, people),
        grantedAt: p.grantedAt,
        mayEdit: giver && (admin || p.userId.toLowerCase() !== me),
        mayEnd:
          giver ||
          (standing.kind === "appointer" && p.grantedBy.toLowerCase() === me),
      })),
      catalog: [...COURSE_CATALOG],
      grantable: [...grantable],
      // A hidden course takes no new post (`create`), whoever asks.
      mayAppoint: standing.kind !== "outside" && course.archivedAt === null,
    };
  }

  private endOf(value: string | null | undefined): Date | null {
    const endsAt = value ? new Date(value) : null;
    if (checkGrantExpiry(endsAt, null, new Date()) === "past") {
      throw new GrantExpiryInvalidError("The end date is in the past");
    }
    return endsAt;
  }

  async create(
    user: AuthenticatedUser,
    courseId: string,
    dto: CreateCourseNazirDto
  ): Promise<CourseNazirsResponse> {
    const course = await this.courses.getDetail(courseId, user);
    if (course.archivedAt !== null) {
      throw new GrantCourseInvalidError(
        courseId,
        undefined,
        `Course ${courseId} is hidden`
      );
    }
    const standing = await this.standing(user, courseId);
    if (standing.kind === "outside") {
      throw new PermissionNotGivableError(undefined, MEDRESE_STAFF_APPOINT);
    }
    const { codes, unknown, beyondGiver } = checkRequestedCodes(
      dto.permissions,
      await this.ceiling(user, courseId, standing)
    );
    if (unknown.length > 0) throw new UnknownPermissionError(unknown);
    if (standing.kind === "appointer" && codes.length > 0) {
      throw new PermissionNotGivableError(undefined, APPOINTS_ONLY);
    }
    if (beyondGiver.length > 0) throw new GrantExceedsGiverError(beyondGiver);
    const endsAt = this.endOf(dto.endsAt);
    const userId = dto.userId.toLowerCase();
    const [unknownAccount] = await this.directory.findUnknownAccounts([userId]);
    if (unknownAccount) throw new CourseNazirUnknownAccountError(userId);
    // The post keeps its holder from a ban (`RUNS_COURSE_ROLES`): one barred
    // here is not seated, or an appointer could undo the müderris's ban.
    if (await this.bans.isBarred(userId, courseId)) {
      throw new CourseNazirBarredError(userId, courseId);
    }
    await this.repo.assign(user.sub, courseId, {
      userId,
      permissions: codes,
      endsAt,
      authority: standing.kind === "giver" ? standing.authority : null,
      standing: standing.kind,
    });
    return this.list(user, courseId);
  }

  async update(
    user: AuthenticatedUser,
    courseId: string,
    postId: string,
    dto: UpdateCourseNazirDto
  ): Promise<CourseNazirsResponse> {
    await this.courses.getDetail(courseId, user);
    const standing = await this.standing(user, courseId);
    if (standing.kind !== "giver") {
      throw new PermissionNotGivableError(
        undefined,
        standing.kind === "appointer" ? APPOINTS_ONLY : MEDRESE_STAFF_APPOINT
      );
    }
    const { codes, unknown } = checkRequestedCodes(dto.permissions, []);
    if (unknown.length > 0) throw new UnknownPermissionError(unknown);
    const endsAt = this.endOf(dto.endsAt);
    const grantable = new Set(await this.ceiling(user, courseId, standing));
    await this.repo.update(user.sub, courseId, postId, {
      permissions: codes,
      endsAt,
      authority: standing.authority,
      // Only what this save hands on is held to the ceiling: a code given or
      // moved later. Dropping one or moving its end earlier gives nothing.
      ceiling: (given) => {
        const beyond = [...new Set(given)].filter((c) => !grantable.has(c));
        if (beyond.length > 0) throw new GrantExceedsGiverError(beyond.sort());
      },
    });
    return this.list(user, courseId);
  }

  /** Who holds the ders nazırı post, or null when the course has no such post. */
  holderOf(courseId: string, postId: string): Promise<string | null> {
    return this.repo.postHolder(courseId, postId);
  }

  async revoke(
    user: AuthenticatedUser,
    courseId: string,
    postId: string
  ): Promise<void> {
    await this.courses.getDetail(courseId, user);
    const standing = await this.standing(user, courseId);
    if (standing.kind === "outside") {
      throw new PermissionNotGivableError(undefined, MEDRESE_STAFF_APPOINT);
    }
    await this.repo.revoke(user.sub, courseId, postId, {
      appointedBy: standing.kind === "appointer" ? user.sub : undefined,
    });
  }
}
