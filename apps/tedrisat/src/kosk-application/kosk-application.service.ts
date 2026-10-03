import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { koskApplications } from "../database/schema/kosk-application.schema";
import { CreateKoskApplicationDto } from "./dto/create-kosk-application.dto";
import { KoskApplicationResponse } from "./dto/kosk-application-response.dto";

/**
 * The applicant's side of "open a köşk" (MDRS-166, screen tedris/37). It only
 * records the request as PENDING; Medaris management's review is another
 * screen. Nothing limits how many a person files: the global throttler is the
 * only guard, and the design does not say otherwise.
 */
@Injectable()
export class KoskApplicationService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(
    applicantId: string,
    dto: CreateKoskApplicationDto
  ): Promise<KoskApplicationResponse> {
    const [row] = await this.databaseService.db
      .insert(koskApplications)
      .values({
        applicantId,
        name: dto.name.trim(),
        field: dto.field,
        summary: dto.summary.trim(),
        reason: dto.reason.trim(),
        email: dto.email.trim(),
        phone: dto.phone?.trim() || null,
      })
      .returning({
        id: koskApplications.id,
        status: koskApplications.status,
      });
    return row;
  }
}
