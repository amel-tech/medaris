import { ApiProperty } from "@nestjs/swagger";
import { IsUUID, Matches } from "class-validator";
import { PARTNER_CLIENT_ID_PATTERN } from "../../config/integration-partners-env";
import { COURSE_CODE_PATTERN } from "../domain/partner-enrollment";

/** A partner application this server works with: its id and the name people read. */
export class PartnerApplicationResponse {
  @ApiProperty({
    example: "ornek-uygulama",
    description: "Its client id in the realm.",
  })
  id!: string;

  @ApiProperty({ example: "Örnek Uygulama" })
  name!: string;
}

export class PartnerCodeResponse {
  @ApiProperty({ example: "tecvid-2026-guz" }) code!: string;
  @ApiProperty() createdAt!: Date;
}

export class CoursePartnerCodesItem {
  @ApiProperty({ example: "ornek-uygulama" }) id!: string;
  @ApiProperty({ example: "Örnek Uygulama" }) name!: string;
  @ApiProperty({ type: () => PartnerCodeResponse, isArray: true })
  codes!: PartnerCodeResponse[];
}

export class CoursePartnerCodesResponse {
  @ApiProperty({
    type: () => CoursePartnerCodesItem,
    isArray: true,
    description:
      "Every partner application this server works with, each with its codes mapped to this course (possibly none).",
  })
  partners!: CoursePartnerCodesItem[];
}

export class AddPartnerCodeDto {
  @ApiProperty({ example: "ornek-uygulama", description: "The partner's id." })
  @Matches(PARTNER_CLIENT_ID_PATTERN)
  partner!: string;

  @ApiProperty({
    example: "tecvid-2026-guz",
    pattern: COURSE_CODE_PATTERN.source,
  })
  @Matches(COURSE_CODE_PATTERN)
  code!: string;
}

/** The path of `DELETE /courses/{id}/partner-codes/{partner}/{code}`. */
export class PartnerCodeParams {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;

  @ApiProperty({ example: "ornek-uygulama" })
  @Matches(PARTNER_CLIENT_ID_PATTERN)
  partner!: string;

  @ApiProperty({ example: "tecvid-2026-guz" })
  @Matches(COURSE_CODE_PATTERN)
  code!: string;
}
