import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
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
  ValidateNested,
} from "class-validator";

export const GROUP_SCOPES = ["PLATFORM", "ALL_COURSES", "COURSE"] as const;
export type GroupScope = (typeof GROUP_SCOPES)[number];

export const USERS_POLICIES = ["keep", "revoke"] as const;
export type UsersPolicy = (typeof USERS_POLICIES)[number];

export const DISMISS_ACTIONS = ["TAKE_OVER", "DROP"] as const;
export type DismissAction = (typeof DISMISS_ACTIONS)[number];

/** What a dismissal asks an answer for: a role or a grant the person gave to someone. */
export const GIVEN_KINDS = ["ROLE", "GRANT"] as const;
export type GivenKind = (typeof GIVEN_KINDS)[number];

/**
 * What `GET …/given` lists: the roles and grants above, and the permission
 * groups the person defined or changed. A group is listed so the başnazım sees
 * it, and it needs no answer on dismissal: it is not a right the person holds,
 * and what its holders hold is theirs.
 */
export const GIVEN_ITEM_KINDS = ["ROLE", "GRANT", "GROUP"] as const;
export type GivenItemKind = (typeof GIVEN_ITEM_KINDS)[number];

export const GROUP_NAME_MAX = 80;
const MAX_CODES = 64;

// ---- the catalog ---------------------------------------------------------

export class CatalogSectionResponse {
  @ApiProperty({ example: "kosks" })
  id!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class PermissionCatalogResponse {
  @ApiProperty({
    type: () => [CatalogSectionResponse],
    description: "The platform's permissions in the five sections of nizam/12",
  })
  platform!: CatalogSectionResponse[];

  @ApiProperty({
    type: String,
    isArray: true,
    description: "What a group scoped to courses may carry",
  })
  course!: string[];
}

// ---- groups --------------------------------------------------------------

export class PermissionGroupResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: GROUP_SCOPES, enumName: "PermissionGroupScope" })
  scope!: GroupScope;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  courseId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  courseTitle!: string | null;

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ description: "People who hold the group right now" })
  userCount!: number;
}

export class GroupUserResponse {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ description: "Holds the Medaris nazımı role right now" })
  isMedarisNazim!: boolean;

  @ApiProperty({ type: Date, nullable: true })
  expiresAt!: Date | null;
}

const permissionsProperty = {
  type: String,
  isArray: true,
  description: "Codes from the catalog of the group's scope",
};

export class CreatePermissionGroupDto {
  @ApiProperty({ maxLength: GROUP_NAME_MAX })
  @IsString()
  @MaxLength(GROUP_NAME_MAX)
  @Matches(/\S/, { message: "name must not be blank" })
  name!: string;

  @ApiProperty({ enum: GROUP_SCOPES, enumName: "PermissionGroupScope" })
  @IsIn(GROUP_SCOPES)
  scope!: GroupScope;

  @ApiPropertyOptional({
    format: "uuid",
    description: "The one course, when `scope` is COURSE",
  })
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiProperty(permissionsProperty)
  @IsArray()
  @ArrayMaxSize(MAX_CODES)
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdatePermissionGroupDto {
  @ApiProperty({ maxLength: GROUP_NAME_MAX })
  @IsString()
  @MaxLength(GROUP_NAME_MAX)
  @Matches(/\S/, { message: "name must not be blank" })
  name!: string;

  @ApiProperty(permissionsProperty)
  @IsArray()
  @ArrayMaxSize(MAX_CODES)
  @IsString({ each: true })
  permissions!: string[];

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

export class DeletePermissionGroupDto {
  @ApiPropertyOptional({
    enum: USERS_POLICIES,
    enumName: "UsersPolicy",
    description:
      "Required while people hold the group: `keep` turns the group's permissions into single permissions for each of them, `revoke` takes them away.",
  })
  @IsOptional()
  @IsIn(USERS_POLICIES)
  usersPolicy?: UsersPolicy;
}

// ---- Medaris nazımları ---------------------------------------------------

export class NazimPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;
}

export class NazimGroupResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: GROUP_SCOPES, enumName: "PermissionGroupScope" })
  scope!: GroupScope;

  @ApiProperty({ type: String, nullable: true })
  courseTitle!: string | null;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class NazimPermissionResponse {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  grantedAt!: Date;
}

export class MedarisNazimResponse {
  @ApiProperty({ type: () => NazimPersonResponse })
  user!: NazimPersonResponse;

  @ApiProperty({ type: () => NazimPersonResponse, nullable: true })
  appointedBy!: NazimPersonResponse | null;

  @ApiProperty()
  appointedAt!: Date;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: "The appointment's own end; null while it has none",
  })
  assignmentExpiresAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "The earliest end among the appointment and the platform permissions; null when nothing ends",
  })
  expiresAt!: Date | null;

  @ApiProperty({
    type: () => [NazimGroupResponse],
    description: "Every group held: the platform's and the course-wide ones",
  })
  groups!: NazimGroupResponse[];

  @ApiProperty({
    type: () => [NazimPermissionResponse],
    description: "Platform permissions given one by one, not through a group",
  })
  permissions!: NazimPermissionResponse[];
}

export class AppointMedarisNazimDto {
  @ApiProperty({ format: "uuid", description: "The account to appoint" })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiProperty(permissionsProperty)
  @IsArray()
  @ArrayMaxSize(MAX_CODES)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    nullable: true,
    description: "When the appointment and its permissions end; empty: never",
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class SetNazimGrantsDto {
  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description: "A platform group, or empty for none",
  })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiProperty({
    type: String,
    isArray: true,
    description: "The permissions given on top of the group",
  })
  @IsArray()
  @ArrayMaxSize(MAX_CODES)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    nullable: true,
    description:
      "When the permissions end; empty: when the appointment does. Never later than the appointment's end.",
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class GivenItemResponse {
  @ApiProperty({ enum: GIVEN_ITEM_KINDS, enumName: "GivenItemKind" })
  kind!: GivenItemKind;

  @ApiProperty({
    format: "uuid",
    description:
      "The role row, the grant row or, for a GROUP, the permission group",
  })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  role!: string | null;

  @ApiProperty({ type: String, nullable: true })
  permission!: string | null;

  @ApiProperty({ type: String, nullable: true })
  groupName!: string | null;

  @ApiProperty({
    type: () => NazimPersonResponse,
    nullable: true,
    description: "Who it went to; null for a GROUP, which goes to no one yet",
  })
  to!: NazimPersonResponse | null;

  @ApiProperty({
    type: String,
    isArray: true,
    nullable: true,
    description: "The codes a GROUP carries now; null for a role or a grant",
  })
  groupPermissions!: string[] | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ["create", "update"],
    description:
      "For a GROUP: whether the person defined it or last changed it; null otherwise",
  })
  groupAction!: "create" | "update" | null;

  @ApiProperty()
  scopeType!: string;

  @ApiProperty({ type: String, nullable: true })
  scopeName!: string | null;
}

export class DismissDecisionDto {
  @ApiProperty({ enum: GIVEN_KINDS, enumName: "GivenKind" })
  @IsIn(GIVEN_KINDS)
  kind!: GivenKind;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;

  @ApiProperty({
    enum: DISMISS_ACTIONS,
    enumName: "DismissAction",
    description:
      "TAKE_OVER: the başnazım becomes the giver and the right stays. DROP: the right is revoked.",
  })
  @IsIn(DISMISS_ACTIONS)
  action!: DismissAction;
}

export class DismissMedarisNazimDto {
  @ApiProperty({
    type: () => [DismissDecisionDto],
    description: "One per item `GET …/given` lists",
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DismissDecisionDto)
  decisions!: DismissDecisionDto[];
}
