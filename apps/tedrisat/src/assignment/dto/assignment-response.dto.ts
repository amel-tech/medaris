import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CourseStatus } from "../../course/domain/course-status.enum";
import {
  ASSIGNED_ROLES,
  SCOPE_TYPES,
} from "../../database/schema/role-assignment.schema";

export class PersonRef {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({
    type: String,
    description: "Null when the person has not signed in since names were kept",
  })
  displayName!: string | null;
}

export class AssignedCourseInfo {
  @ApiProperty({ enum: CourseStatus })
  status!: CourseStatus;

  @ApiProperty({ description: "Hidden by its köşk manager" })
  hidden!: boolean;

  @ApiProperty()
  koskId!: string;

  @ApiProperty()
  koskName!: string;

  @ApiPropertyOptional({ type: String })
  madrasahId!: string | null;

  @ApiPropertyOptional({ type: String })
  madrasahName!: string | null;

  @ApiProperty({ description: "Talebe currently enrolled" })
  studentCount!: number;
}

export class AssignmentResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: Object.values(ASSIGNED_ROLES) })
  role!: string;

  @ApiProperty({ enum: Object.values(SCOPE_TYPES) })
  scopeType!: string;

  @ApiPropertyOptional({ type: String, description: "Null for the platform" })
  scopeId!: string | null;

  @ApiPropertyOptional({ type: String })
  scopeName!: string | null;

  @ApiProperty({ description: "Imam of the course (MUDERRIS only)" })
  isImam!: boolean;

  @ApiProperty()
  grantedAt!: Date;

  @ApiPropertyOptional({ type: Date, description: "Null: no end date" })
  expiresAt!: Date | null;

  @ApiProperty({ type: PersonRef })
  grantedBy!: PersonRef;

  @ApiProperty({ description: "The caller gave this role to themselves" })
  grantedBySelf!: boolean;

  @ApiPropertyOptional({
    type: AssignedCourseInfo,
    description: "Present when the scope is a course",
  })
  course?: AssignedCourseInfo;
}

export class MyAssignmentsResponse {
  @ApiProperty({ type: [AssignmentResponse] })
  assignments!: AssignmentResponse[];
}

export class RoleSummary {
  @ApiProperty({ enum: Object.values(ASSIGNED_ROLES) })
  role!: string;

  @ApiProperty({ description: "In how many scopes the role is held" })
  scopeCount!: number;
}

export class MyRolesResponse {
  @ApiProperty({ description: "Holds the SYSTEM_ADMIN realm role" })
  systemAdmin!: boolean;

  @ApiProperty({ type: [RoleSummary] })
  roles!: RoleSummary[];
}

export class PermissionGroupRef {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class GrantResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: Object.values(SCOPE_TYPES) })
  scopeType!: string;

  @ApiPropertyOptional({ type: String })
  scopeId!: string | null;

  @ApiPropertyOptional({ type: String })
  scopeName!: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "A catalog code; null when the grant is a group",
  })
  permission!: string | null;

  @ApiPropertyOptional({ type: PermissionGroupRef })
  group!: PermissionGroupRef | null;

  @ApiProperty()
  grantedAt!: Date;

  @ApiPropertyOptional({ type: Date })
  expiresAt!: Date | null;

  @ApiProperty({ type: PersonRef })
  grantedBy!: PersonRef;

  @ApiProperty()
  grantedBySelf!: boolean;
}

export class MyGrantsResponse {
  @ApiProperty({ type: [GrantResponse] })
  grants!: GrantResponse[];
}

export class MyPermissionsResponse {
  @ApiProperty({
    type: [String],
    description: "Every catalog code the caller holds in any scope",
  })
  permissions!: string[];
}

export class ScopeRefResponse {
  @ApiProperty({ enum: Object.values(SCOPE_TYPES) })
  type!: string;

  @ApiPropertyOptional({ type: String })
  id!: string | null;

  @ApiPropertyOptional({ type: String })
  name!: string | null;
}

export class EffectivePermissionGroup {
  @ApiPropertyOptional({
    type: String,
    enum: Object.values(ASSIGNED_ROLES),
    description: "Null for scopes where the caller holds a grant but no role",
  })
  role!: string | null;

  @ApiProperty({ enum: Object.values(SCOPE_TYPES) })
  scopeType!: string;

  @ApiProperty({ type: [ScopeRefResponse] })
  scopes!: ScopeRefResponse[];

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class MyEffectivePermissionsResponse {
  @ApiProperty({ type: [EffectivePermissionGroup] })
  groups!: EffectivePermissionGroup[];
}

export class ChiefNazimResponse {
  @ApiPropertyOptional({
    type: String,
    description:
      "Null when nobody holds the role or the directory is not reachable",
  })
  displayName!: string | null;
}
