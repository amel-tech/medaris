import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export const COURSES_ACTIONS = ["KEEP", "HIDE"] as const;
export type CoursesAction = (typeof COURSES_ACTIONS)[number];

export class GrantHostingRightDto {
  @ApiProperty({
    format: "uuid",
    description: "The medrese that gets the right",
  })
  @IsUUID()
  madrasahId!: string;
}

export class HostingOpenCourseResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({
    enum: ["DRAFT", "PUBLISHED"],
    enumName: "HostingCourseStatus",
  })
  status!: "DRAFT" | "PUBLISHED";

  @ApiProperty({
    description: "Enrolled talebe (pending applications do not count)",
  })
  studentCount!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The course's imam, as the course page names them",
  })
  imamName!: string | null;
}

export class HostingPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}

export class HostingGrantedByResponse extends HostingPersonResponse {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ["SYSTEM_ADMIN", "KOSK_NAZIM"],
    description:
      "How the granter was entitled to grant; null on rights older than MDRS-170",
  })
  role!: "SYSTEM_ADMIN" | "KOSK_NAZIM" | null;
}

export class HostingRightResponse {
  @ApiProperty({ format: "uuid" })
  madrasahId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  handle!: string;

  @ApiProperty({ example: 215 })
  coverHue!: number;

  @ApiPropertyOptional({
    type: HostingPersonResponse,
    nullable: true,
    description: "The medrese's başmüderris; null when it has none",
  })
  headMuderris!: HostingPersonResponse | null;

  @ApiProperty({ type: HostingGrantedByResponse })
  grantedBy!: HostingGrantedByResponse;

  @ApiProperty({ type: Date })
  grantedAt!: Date;

  @ApiProperty({
    type: HostingOpenCourseResponse,
    isArray: true,
    description:
      "The medrese's courses in this köşk that are not hidden: what the right's withdrawal decides about",
  })
  openCourses!: HostingOpenCourseResponse[];
}
