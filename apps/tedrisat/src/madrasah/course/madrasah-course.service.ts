import { Injectable } from "@nestjs/common";
import { displayNameOf } from "../../assignment/assignment.service";
import { UserDirectoryService } from "../../assignment/user-directory.service";
import { MuderrisUnknownUserError } from "../../course/errors/muderris-unknown-user.error";
import { MadrasahNotFoundError } from "../errors/madrasah-not-found.error";
import type { IMadrasahCourseListItem } from "../madrasah.repository.interface";
import { MadrasahService } from "../madrasah.service";
import { planCourseTeam } from "./course-team";
import {
  HostingRightRequiredError,
  MadrasahCourseAlreadyHiddenError,
  MadrasahCourseNotFoundError,
} from "./errors";
import { MadrasahCourseRepository } from "./madrasah-course.repository";
import type { IMadrasahHostingKosk } from "./madrasah-course.repository.interface";

export interface OpenMadrasahCourseInput {
  koskId: string;
  title: string;
  muderrisUserIds: string[];
  imamUserId?: string;
  closedCourse?: boolean;
  requiresApproval?: boolean;
}

/**
 * The medrese's own courses (nazir/07, 08, 17, 18). Reached through
 * `MadrasahCourseController`, whose `@Authz` scope decides who may call it —
 * the medrese's başmüderris and SYSTEM_ADMIN; nothing here re-checks the
 * caller. The permissions the catalogue names for these actions
 * (`madrasah.course_open`, `madrasah.muderris_manage`, `madrasah.course_hide`)
 * are not read: grants are not enforced by `AuthzGuard`.
 */
@Injectable()
export class MadrasahCourseService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: MadrasahCourseRepository,
    private readonly madrasahService: MadrasahService,
    private readonly directory: UserDirectoryService
  ) {}

  /** The köşks the medrese may open courses in. */
  hostingKosks(madrasahId: string): Promise<IMadrasahHostingKosk[]> {
    return this.repo.findHostingKosks(madrasahId);
  }

  /** Opens a DRAFT course (nazir/08) and answers it as the course list shows it. */
  async open(
    madrasahId: string,
    input: OpenMadrasahCourseInput,
    actorId: string
  ): Promise<IMadrasahCourseListItem> {
    const team = planCourseTeam(input.muderrisUserIds, input.imamUserId);
    const names = await this.namesOf(team.userIds);
    const result = await this.repo.open({
      madrasahId,
      koskId: input.koskId,
      title: input.title,
      requiresApproval: input.requiresApproval ?? false,
      closed: input.closedCourse ?? false,
      muderris: team.userIds.map((userId) => ({
        userId,
        name: names.get(userId),
      })),
      imamUserId: team.imamUserId,
      actorId,
    });
    if (result.status === "madrasah-not-found") {
      throw new MadrasahNotFoundError(madrasahId);
    }
    if (result.status === "no-hosting-right") {
      throw new HostingRightRequiredError(madrasahId, input.koskId);
    }
    return this.listItem(madrasahId, result.courseId);
  }

  /** Replaces the course's müderrisler (nazir/17) and answers the course as the list shows it. */
  async setMuderris(
    madrasahId: string,
    courseId: string,
    input: { muderrisUserIds: string[]; imamUserId?: string },
    actorId: string
  ): Promise<IMadrasahCourseListItem> {
    const team = planCourseTeam(input.muderrisUserIds, input.imamUserId);
    const current = await this.repo.findMuderrisUserIds(madrasahId, courseId);
    if (current === null) {
      throw new MadrasahCourseNotFoundError(madrasahId, courseId);
    }
    // Only an account the course did not list before is looked up: one that
    // stays keeps saving even if it is no longer in the directory.
    const names = await this.namesOf(
      team.userIds.filter((id) => !current.includes(id))
    );
    const found = await this.repo.setMuderris({
      madrasahId,
      courseId,
      muderris: team.userIds.map((userId) => ({
        userId,
        name: names.get(userId),
      })),
      imamUserId: team.imamUserId,
      actorId,
    });
    if (!found) throw new MadrasahCourseNotFoundError(madrasahId, courseId);
    return this.listItem(madrasahId, courseId);
  }

  /** Hides the course (nazir/18); nothing is deleted. */
  async hide(
    madrasahId: string,
    courseId: string,
    actorId: string
  ): Promise<void> {
    const result = await this.repo.hideCourse(madrasahId, courseId, actorId);
    if (result === "not-found") {
      throw new MadrasahCourseNotFoundError(madrasahId, courseId);
    }
    if (result === "already-hidden") {
      throw new MadrasahCourseAlreadyHiddenError(courseId);
    }
  }

  /**
   * The names the new müderris rows carry, from the users table and then the
   * realm's directory. An account neither knows is refused: a link to nobody
   * would grant MUDERRIS to whoever later signs in under that id.
   */
  private async namesOf(userIds: string[]): Promise<Map<string, string>> {
    const people = await this.directory.resolvePeople(userIds);
    const names = new Map<string, string>();
    for (const id of userIds) {
      const person = people.get(id);
      if (!person) throw new MuderrisUnknownUserError(id);
      names.set(id, displayNameOf(person) ?? id);
    }
    return names;
  }

  private async listItem(
    madrasahId: string,
    courseId: string
  ): Promise<IMadrasahCourseListItem> {
    const [item] = await this.madrasahService.findCourseList(madrasahId, {
      courseId,
    });
    if (!item) throw new MadrasahCourseNotFoundError(madrasahId, courseId);
    return item;
  }
}
