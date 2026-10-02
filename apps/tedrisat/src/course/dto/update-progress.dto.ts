import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { EnrollmentStatus } from "../domain/enrollment-status.enum";

export class UpdateProgressDto {
  @ApiProperty({ example: 35, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @ApiPropertyOptional({
    enum: EnrollmentStatus,
    deprecated: true,
    description:
      "Not the talebe's to set (MDRS-105): a value other than the enrollment's current status is refused with 403 ENROLLMENT_STATUS_FORBIDDEN. Completion is set by the course team.",
  })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}
