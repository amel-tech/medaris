import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IIntegrationPartner } from "../config/integration-partners-env";
import {
  PartnerCodeTakenError,
  PartnerUnknownError,
} from "./errors/partner-errors";
import { PartnerRepository } from "./partner.repository";

export interface ICoursePartnerCodes {
  id: string;
  name: string;
  codes: { code: string; createdAt: Date }[];
}

/**
 * "Ortak uygulama kodları" in nazar's course settings: which of a partner
 * application's codes enrol people in this course. Authorization is the
 * routes', `course.partner_codes` on the course (`PartnerCodesController`);
 * this decides the rest. Only the partners in `INTEGRATION_PARTNERS` are
 * offered: a code for one the server does not know would enrol nobody.
 */
@Injectable()
export class PartnerCodesService {
  private readonly partners: readonly IIntegrationPartner[];

  // Value imports: see the useImportType trap in AGENTS.md.
  constructor(
    private readonly repo: PartnerRepository,
    config: ConfigService
  ) {
    this.partners =
      config.get<IIntegrationPartner[]>("integrations.partners") ?? [];
  }

  /** The partner applications this server works with, display names only. */
  listPartners(): { id: string; name: string }[] {
    return this.partners.map((partner) => ({
      id: partner.clientId,
      name: partner.name,
    }));
  }

  /** Every configured partner with its codes for this course, possibly none. */
  async courseCodes(courseId: string): Promise<ICoursePartnerCodes[]> {
    const rows = await this.repo.listCourseCodes(courseId);
    return this.partners.map((partner) => ({
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
    const partner = this.partnerOf(partnerId);
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
   */
  async removeCode(
    courseId: string,
    partnerId: string,
    code: string,
    actorId: string
  ): Promise<void> {
    const partner = this.partnerOf(partnerId);
    await this.repo.removeCode({ partner, code, courseId, actorId });
  }

  private partnerOf(partnerId: string): IIntegrationPartner {
    const partner = this.partners.find((p) => p.clientId === partnerId);
    if (!partner) throw new PartnerUnknownError();
    return partner;
  }
}
