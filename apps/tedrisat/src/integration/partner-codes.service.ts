import { Injectable } from "@nestjs/common";
import type { IPartnerActor } from "./domain/partner-actor";
import {
  PartnerCodeTakenError,
  PartnerUnknownError,
} from "./errors/partner-errors";
import { PartnerRepository } from "./partner.repository";
import { PartnerRegistry } from "./partner-registry";

export interface ICoursePartnerCodes {
  id: string;
  name: string;
  codes: { code: string; createdAt: Date }[];
}

/**
 * "Ortak uygulama kodları" in nazar's course settings: which of a partner
 * application's codes enrol people in this course. Authorization is the
 * routes', `course.partner_codes` on the course (`PartnerCodesController`);
 * this decides the rest. Only the course's partners are offered: the enabled
 * ones the başnazım bound to the köşk the course is held in. A course of a
 * köşk with five partners lists five, however many the platform has.
 */
@Injectable()
export class PartnerCodesService {
  // Value imports: see the useImportType trap in AGENTS.md.
  constructor(
    private readonly repo: PartnerRepository,
    private readonly registry: PartnerRegistry
  ) {}

  /** The course's partners, each with its codes for this course, possibly none. */
  async courseCodes(courseId: string): Promise<ICoursePartnerCodes[]> {
    const [partners, rows] = await Promise.all([
      this.repo.coursePartners(courseId),
      this.repo.listCourseCodes(courseId),
    ]);
    return partners.map((partner) => ({
      id: partner.clientId,
      name: partner.name,
      codes: rows
        .filter((row) => row.partnerClientId === partner.clientId)
        .map((row) => ({ code: row.code, createdAt: row.createdAt })),
    }));
  }

  /**
   * Maps a code to the course. Adding one it already has changes nothing; a
   * code another course has is refused, naming nothing about that course.
   */
  async addCode(
    courseId: string,
    partnerId: string,
    code: string,
    actorId: string
  ): Promise<{ code: string; createdAt: Date }> {
    const partner = await this.partnerOf(courseId, partnerId);
    const { result, createdAt } = await this.repo.addCode({
      partner,
      code,
      courseId,
      actorId,
    });
    if (result === "taken") throw new PartnerCodeTakenError();
    return { code, createdAt };
  }

  /**
   * Takes a code off the course. One it does not have is no error: the
   * partner's registrations under it already enrol nobody here. The people
   * it enrolled stay; a cancellation the partner sends later still reaches
   * them, through the registration's own link.
   *
   * Any registered partner's code may be taken off, enabled or not, bound to
   * the course's köşk or not: a code left on a course after its partner was
   * disabled, or from before the köşk scope, must never be stuck there. Only
   * adding a code asks for one of the course's partners.
   */
  async removeCode(
    courseId: string,
    partnerId: string,
    code: string,
    actorId: string
  ): Promise<void> {
    const partner = await this.registry.find(partnerId);
    if (!partner) throw new PartnerUnknownError();
    await this.repo.removeCode({
      partner: { clientId: partner.clientId, name: partner.name },
      code,
      courseId,
      actorId,
    });
  }

  /**
   * One of the course's partners, for adding a code, or `PARTNER_UNKNOWN`: a
   * partner of another köşk, a disabled one and an id nobody registered read
   * the same.
   */
  private async partnerOf(
    courseId: string,
    partnerId: string
  ): Promise<IPartnerActor> {
    const partner = (await this.repo.coursePartners(courseId)).find(
      (p) => p.clientId === partnerId
    );
    if (!partner) throw new PartnerUnknownError();
    return partner;
  }
}
