import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AssignmentResponse } from "../../assignment/dto/assignment-response.dto";
import {
  ASSIGNED_ROLES,
  SCOPE_TYPES,
} from "../../database/schema/role-assignment.schema";

export class ManagedKoskRef {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "Süleymaniye Köşkü" })
  name!: string;
}

export class TaughtCourseRef {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "Usûl-i Fıkıh'a Giriş" })
  title!: string;

  @ApiProperty()
  koskId!: string;
}

export class NazirMadrasahRef {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MeRolesResponse {
  @ApiProperty({ description: "Holds the SYSTEM_ADMIN realm role" })
  systemAdmin!: boolean;

  @ApiProperty({
    type: [NazirMadrasahRef],
    description:
      "Medreses the caller is başmüderris or nazır of, from their live role assignments.",
  })
  nazirOf!: NazirMadrasahRef[];

  @ApiProperty({ type: [ManagedKoskRef] })
  manages!: ManagedKoskRef[];

  @ApiProperty({ type: [TaughtCourseRef] })
  teaches!: TaughtCourseRef[];
}

export class MeScopePermissions {
  @ApiProperty({ enum: Object.values(SCOPE_TYPES) })
  scopeType!: string;

  @ApiPropertyOptional({ type: String, description: "Null for the platform" })
  scopeId!: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "The köşk's or medrese's name, the course's title",
  })
  scopeName!: string | null;

  @ApiProperty({
    enum: Object.values(ASSIGNED_ROLES),
    isArray: true,
    description: "The caller's roles held in exactly this scope",
  })
  roles!: string[];

  @ApiProperty({
    type: [String],
    description:
      "What the caller holds in this scope, sorted, as the permission engine computes it: role defaults and live grants, a grant only while a role covers it. A köşk's or medrese's entry includes the course work held across its courses. Codes every signed-in caller holds (viewing, enrolling) are left out. Policies and passive scopes are not applied: the routes still refuse what they close.",
  })
  permissions!: string[];
}

export class MeResponse {
  @ApiProperty({ description: "The Keycloak subject id" })
  id!: string;

  @ApiPropertyOptional({ type: String, example: "talebe@example.com" })
  email!: string | null;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiPropertyOptional({ type: String })
  givenName!: string | null;

  @ApiPropertyOptional({ type: String })
  familyName!: string | null;

  @ApiPropertyOptional({ type: String, example: "Europe/Istanbul" })
  timeZone!: string | null;

  @ApiPropertyOptional({ type: String, example: "tr" })
  locale!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  lastSeenAt!: Date;

  @ApiProperty({ type: MeRolesResponse })
  roles!: MeRolesResponse;

  @ApiProperty({
    type: [AssignmentResponse],
    description: "The caller's live role assignments, as GET /me/assignments",
  })
  assignments!: AssignmentResponse[];

  @ApiProperty({
    type: [MeScopePermissions],
    description:
      "One entry for every scope the caller holds a role in, and for every scope below a role they hold a grant in. The realm role (başnazım) holds everything and is not a list of codes: it adds no entry, so a başnazım with no role rows gets none.",
  })
  permissions!: MeScopePermissions[];
}
