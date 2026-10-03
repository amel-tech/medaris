import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";
import {
  GROUP_NAME_MAX,
  USERS_POLICIES,
  type UsersPolicy,
} from "../../../assignment/admin/dto/permission-admin.dto";

export const MADRASAH_GROUP_SCOPES = ["MADRASAH", "COURSE"] as const;
export type MadrasahGroupScope = (typeof MADRASAH_GROUP_SCOPES)[number];

const MAX_CODES = 64;
const MAX_COURSES = 200;

const groupScopeProperty = {
  enum: MADRASAH_GROUP_SCOPES,
  enumName: "MadrasahPermissionGroupScope",
};

/** nazir/06 and nazir/16: the checkboxes, and which of them the caller may tick. */
export class MadrasahPermissionCatalogResponse {
  @ApiProperty({
    type: [String],
    description: 'The "Medrese" section, in the order the dialogs print it',
  })
  madrasah!: string[];

  @ApiProperty({
    type: [String],
    description:
      'The "Medrese dersleri" section: the permissions held in courses',
  })
  course!: string[];

  @ApiProperty({
    type: [String],
    description:
      "What the caller may give. The medrese's başmüderris and the başnazım may give every code above; anyone else none, because what a nazır was given cannot be handed on.",
  })
  givable!: string[];
}

export class MadrasahPermissionGroupResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    ...groupScopeProperty,
    description:
      "Worked out from the permissions, not stored: MADRASAH when any is a medrese permission, COURSE when all are course permissions",
  })
  scope!: MadrasahGroupScope;

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ description: "People who hold the group right now" })
  userCount!: number;
}

export class CreateMadrasahPermissionGroupDto {
  @ApiProperty({ maxLength: GROUP_NAME_MAX })
  @IsString()
  @MaxLength(GROUP_NAME_MAX)
  @Matches(/\S/, { message: "name must not be blank" })
  name!: string;

  @ApiProperty({
    ...groupScopeProperty,
    description:
      "MADRASAH: any code of the medrese and course sections. COURSE: course codes only.",
  })
  @IsIn(MADRASAH_GROUP_SCOPES)
  scope!: MadrasahGroupScope;

  @ApiProperty({ type: [String], description: "At least one code" })
  @IsArray()
  @ArrayMaxSize(MAX_CODES)
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateMadrasahPermissionGroupDto {
  @ApiPropertyOptional({ maxLength: GROUP_NAME_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(GROUP_NAME_MAX)
  @Matches(/\S/, { message: "name must not be blank" })
  name?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "The group's whole new set of codes; at least one",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CODES)
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    enum: USERS_POLICIES,
    enumName: "UsersPolicy",
    description:
      "Required when the permissions change while people hold the group. `keep`: they keep what the group gave them, as single permissions. `revoke`: they lose it.",
  })
  @IsOptional()
  @IsIn(USERS_POLICIES)
  usersPolicy?: UsersPolicy;
}

/** nazir/06's Kaydet, and what its dialog opens with. */
export class SetMadrasahNazirPermissionsDto {
  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description: "One of the medrese's own groups; null or omitted for none",
  })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiProperty({
    type: [String],
    description:
      "The permissions given on top of the group, from either section; empty for none",
  })
  @IsArray()
  @ArrayMaxSize(MAX_CODES)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    description:
      '"Hangi derslerde". Null or omitted: every course of the medrese, those opened later too. Otherwise only these courses, at least one, all of this medrese; the group may then carry course permissions only, and something course-level must be given.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COURSES)
  @IsUUID(undefined, { each: true })
  courseIds?: string[] | null;

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    nullable: true,
    description:
      "When the permissions end; null or omitted: when the appointment does. In the future, and never later than the appointment's end.",
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class MadrasahNazirPermissionsResponse {
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  groupId!: string | null;

  @ApiProperty({
    type: [String],
    description: "The single permissions held on top of the group",
  })
  permissions!: string[];

  @ApiProperty({
    type: [String],
    nullable: true,
    description:
      "The courses the permissions are limited to; null: every course",
  })
  courseIds!: string[] | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: "The earliest end among them; null when none ends",
  })
  expiresAt!: Date | null;
}
