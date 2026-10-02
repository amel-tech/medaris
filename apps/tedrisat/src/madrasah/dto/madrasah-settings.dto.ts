import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { NazimPersonResponse } from "../../assignment/admin/dto/permission-admin.dto";
import { CourseStatus } from "../../course/domain/course-status.enum";
import { MadrasahCourseMuderrisResponse } from "./madrasah-overview-response.dto";

export class MadrasahPoliciesResponse {
  @ApiProperty({
    description:
      "Kapalı ders zorunlu. Kept for the courses that will read it; nothing in the API enforces it yet",
  })
  closedCourseRequired!: boolean;

  @ApiProperty({
    description:
      "Kayıt her zaman onaylı. Every enrollment in a course of the medrese waits for approval, whatever the course's own `requiresApproval` says",
  })
  alwaysApproval!: boolean;

  @ApiProperty({
    description:
      "Ders kayıtları herkese açılamaz. Kept for the recordings that will read it; nothing in the API enforces it yet",
  })
  noPublicRecordings!: boolean;
}

export class MadrasahSettingsResponse {
  @ApiProperty({ example: "Süleymaniye Medresesi" })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: () => MadrasahPoliciesResponse })
  policies!: MadrasahPoliciesResponse;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: "The last save of the settings; null until the first one",
  })
  updatedAt!: Date | null;

  @ApiProperty({
    type: () => NazimPersonResponse,
    nullable: true,
    description: "Who saved last; null until the first save",
  })
  updatedBy!: NazimPersonResponse | null;
}

export class MadrasahPoliciesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  closedCourseRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alwaysApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noPublicRecordings?: boolean;
}

export class UpdateMadrasahSettingsDto {
  @ApiPropertyOptional({ example: "Süleymaniye Medresesi", maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/\S/, { message: "name must not be blank" })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 1000,
    description: "Empty or null clears it",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({
    type: () => MadrasahPoliciesDto,
    description: "Only the policies sent change",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MadrasahPoliciesDto)
  policies?: MadrasahPoliciesDto;
}

export class MadrasahCourseListMuderrisResponse extends MadrasahCourseMuderrisResponse {
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "Null for a müderris shown by name alone, with no account",
  })
  userId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Null until that person has signed in once",
  })
  email!: string | null;
}

export class MadrasahCourseListItemResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ format: "uuid" })
  koskId!: string;

  @ApiProperty()
  koskName!: string;

  @ApiProperty({ enum: CourseStatus })
  status!: CourseStatus;

  @ApiProperty({
    description:
      "As stored, after the medrese's policy: enrollments wait for approval",
  })
  requiresApproval!: boolean;

  @ApiProperty({
    description:
      "Kapalı ders, as stored, after the medrese's policy. Nothing in the API reads it yet",
  })
  closed!: boolean;

  @ApiProperty({
    type: Date,
    description: 'When the course was opened ("bugün açıldı")',
  })
  createdAt!: Date;

  @ApiProperty({
    description:
      "Enrolled talebe; pending applications and completions are not counted",
  })
  studentCount!: number;

  @ApiProperty({
    description: 'Applications waiting for approval ("N onay bekliyor")',
  })
  pendingCount!: number;

  @ApiProperty({
    type: [MadrasahCourseListMuderrisResponse],
    description: "In list order; the imam is marked",
  })
  muderris!: MadrasahCourseListMuderrisResponse[];
}
