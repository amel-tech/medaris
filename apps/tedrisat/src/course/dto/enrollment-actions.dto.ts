import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, Matches, MaxLength } from "class-validator";
import { EnrollmentStatus } from "../domain/enrollment-status.enum";

/** The statuses the course team may move an approved enrollment between. */
export const TEAM_SETTABLE_STATUSES = [
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.COMPLETED,
] as const;
export type TeamSettableStatus = (typeof TEAM_SETTABLE_STATUSES)[number];

export class SetEnrollmentStatusDto {
  @ApiProperty({
    enum: [...TEAM_SETTABLE_STATUSES],
    enumName: "TeamSettableEnrollmentStatus",
    description:
      "COMPLETED marks the course completed for the talebe; ENROLLED reopens it. A pending request is approved instead (MDRS-105).",
  })
  @IsIn(TEAM_SETTABLE_STATUSES)
  status!: TeamSettableStatus;
}

export class RemoveEnrollmentDto {
  @ApiProperty({
    example: "Üç haftadır derslere katılmıyor.",
    maxLength: 500,
    description:
      "Why the talebe is taken out of the course. Kept in the audit log; required, and not blank.",
  })
  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: "reason must not be blank" })
  reason!: string;
}
