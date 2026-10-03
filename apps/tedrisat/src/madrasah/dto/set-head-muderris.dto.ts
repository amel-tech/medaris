import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";
import {
  DismissDecisionDto,
  NazimPersonResponse,
} from "../../assignment/admin/dto/permission-admin.dto";

export class SetHeadMuderrisDto {
  @ApiProperty({
    format: "uuid",
    description: "The account that becomes the başmüderris",
  })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description:
      "Görev bitişi (nizam/22). Omitted: until taken away. In the past: 400.",
  })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @ApiPropertyOptional({
    type: () => [DismissDecisionDto],
    description:
      "One answer per item `GET …/head-muderris/delegations` lists, when the medrese has a başmüderris who is replaced: TAKE_OVER leaves the right in place under the caller's name, DROP revokes it. Incomplete: 400 (DISMISS_DECISIONS_INCOMPLETE), nothing changes.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DismissDecisionDto)
  delegations?: DismissDecisionDto[];
}

export class HeadDelegationResponse {
  @ApiProperty({ enum: ["ROLE", "GRANT"], enumName: "HeadDelegationKind" })
  kind!: "ROLE" | "GRANT";

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The role handed on (MEDRESE_NAZIR), for a ROLE",
  })
  role!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The permission code, for a single-permission GRANT",
  })
  permission!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The group's name, for a group GRANT",
  })
  groupName!: string | null;

  @ApiProperty({ type: () => NazimPersonResponse })
  to!: NazimPersonResponse;

  @ApiProperty({ type: Date })
  grantedAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  expiresAt!: Date | null;
}
