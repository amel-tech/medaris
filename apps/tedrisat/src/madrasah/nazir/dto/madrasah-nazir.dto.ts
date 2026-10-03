import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsUUID,
  ValidateNested,
} from "class-validator";
import {
  DISMISS_ACTIONS,
  type DismissAction,
  NazimPermissionResponse,
  NazimPersonResponse,
} from "../../../assignment/admin/dto/permission-admin.dto";

export class MadrasahNazirGroupResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

/** One row of nazir/05's table. */
export class MadrasahNazirResponse {
  @ApiProperty({ type: () => NazimPersonResponse })
  user!: NazimPersonResponse;

  @ApiProperty({
    type: () => NazimPersonResponse,
    nullable: true,
    description: 'Who appointed them ("Atayan")',
  })
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
      'The earliest end among the appointment and the permissions ("Bitiş"); null when nothing ends',
  })
  expiresAt!: Date | null;

  @ApiProperty({
    type: () => [MadrasahNazirGroupResponse],
    description: "The permission groups they hold in this medrese",
  })
  groups!: MadrasahNazirGroupResponse[];

  @ApiProperty({
    type: () => [NazimPermissionResponse],
    description: "Permissions given one by one, not through a group",
  })
  permissions!: NazimPermissionResponse[];

  @ApiProperty({
    type: () => NazimPersonResponse,
    nullable: true,
    description:
      'Who gave the permissions ("Veren"); null while they hold none',
  })
  grantedBy!: NazimPersonResponse | null;

  @ApiProperty({ type: Date, nullable: true })
  grantedAt!: Date | null;
}

export class MadrasahNazirGivenRoleResponse {
  @ApiProperty({ example: "MEDRESE_NAZIR" })
  role!: string;

  @ApiProperty({ example: "madrasah" })
  scopeType!: string;

  @ApiProperty({ type: String, nullable: true })
  scopeName!: string | null;

  @ApiProperty()
  grantedAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  expiresAt!: Date | null;
}

/** One row of nazir/15: a person and everything the nazır being dismissed gave them. */
export class MadrasahNazirGivenResponse {
  @ApiProperty({ type: () => NazimPersonResponse })
  user!: NazimPersonResponse;

  @ApiProperty({ type: () => [MadrasahNazirGivenRoleResponse] })
  roles!: MadrasahNazirGivenRoleResponse[];

  @ApiProperty({ type: () => [MadrasahNazirGroupResponse] })
  groups!: MadrasahNazirGroupResponse[];

  @ApiProperty({
    type: [String],
    description: "Permission codes given one by one",
  })
  permissions!: string[];
}

export class DismissMadrasahNazirDecisionDto {
  @ApiProperty({
    format: "uuid",
    description: "A person the grants call lists",
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: DISMISS_ACTIONS,
    enumName: "DismissAction",
    description:
      "TAKE_OVER: the caller becomes the giver and everything stays. DROP: everything this nazır gave the person is revoked.",
  })
  @IsIn(DISMISS_ACTIONS)
  action!: DismissAction;
}

export class DismissMadrasahNazirDto {
  @ApiProperty({
    type: () => [DismissMadrasahNazirDecisionDto],
    description:
      "One per person `GET …/grants` lists, and nobody else; empty when it lists no one",
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DismissMadrasahNazirDecisionDto)
  decisions!: DismissMadrasahNazirDecisionDto[];
}
