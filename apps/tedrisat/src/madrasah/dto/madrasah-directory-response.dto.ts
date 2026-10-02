import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const MADRASAH_STATUSES = ["ACTIVE", "PASSIVE", "HIDDEN"] as const;
export type MadrasahStatus = (typeof MADRASAH_STATUSES)[number];

export const MADRASAH_STATUS_FILTERS = ["ALL", ...MADRASAH_STATUSES] as const;
export type MadrasahStatusFilter = (typeof MADRASAH_STATUS_FILTERS)[number];

export class MadrasahPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Null until that person has signed in once",
  })
  name!: string | null;
}

export class MadrasahHostingKoskResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MadrasahDirectoryItemResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "suleymaniye" })
  handle!: string;

  @ApiProperty({ example: "Süleymaniye Medresesi" })
  name!: string;

  @ApiProperty({ example: 215 })
  coverHue!: number;

  @ApiProperty({
    enum: MADRASAH_STATUSES,
    enumName: "MadrasahStatus",
    description:
      "HIDDEN wins over PASSIVE: a hidden medrese is in nobody's list but this one.",
  })
  status!: MadrasahStatus;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: "Since when it is hidden or passive; null while active",
  })
  since!: Date | null;

  @ApiPropertyOptional({
    type: MadrasahPersonResponse,
    nullable: true,
    description: "The oldest held başmüderris; null when there is none",
  })
  headMuderris!: MadrasahPersonResponse | null;

  @ApiProperty({ description: "Courses that are not hidden" })
  courseCount!: number;

  @ApiProperty({
    type: MadrasahHostingKoskResponse,
    isArray: true,
    description: "The köşks that hold a hosting right for this medrese",
  })
  hostingKosks!: MadrasahHostingKoskResponse[];
}

export class MadrasahStatusCountsResponse {
  @ApiProperty() all!: number;
  @ApiProperty() active!: number;
  @ApiProperty() passive!: number;
  @ApiProperty() hidden!: number;
}

export class PassiveMadrasahResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: Date })
  since!: Date;
}

export class MadrasahDirectoryResponse {
  @ApiProperty({ type: MadrasahDirectoryItemResponse, isArray: true })
  items!: MadrasahDirectoryItemResponse[];

  @ApiProperty({ description: "Rows matching the status and search" })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  limit!: number;

  @ApiProperty({
    type: MadrasahStatusCountsResponse,
    description:
      "Every medrese by status, whatever the filter and search: the tabs' numbers",
  })
  counts!: MadrasahStatusCountsResponse;

  @ApiProperty({
    type: PassiveMadrasahResponse,
    isArray: true,
    description: "The passive medreses the page's warning names, oldest first",
  })
  passive!: PassiveMadrasahResponse[];
}
