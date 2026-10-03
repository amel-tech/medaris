import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";
import { PLATFORM_POLICY_KEYS } from "../database/schema/platform-policy.schema";

export class PolicyPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}

export class PlatformPolicyResponse {
  @ApiProperty({
    enum: PLATFORM_POLICY_KEYS,
    enumName: "PlatformPolicyKey",
    description:
      "ALWAYS_REQUIRE_APPROVAL is 'Kayıt her zaman onaylı'; RECORDINGS_NEVER_PUBLIC is 'Ders kayıtları herkese açılamaz'.",
  })
  key!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional({ type: PolicyPersonResponse, nullable: true })
  changedBy!: PolicyPersonResponse | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  changedAt!: Date | null;

  @ApiProperty({
    type: [String],
    description:
      "Names of the köşks that already apply the same rule on their own ('Kendi kapsamında uygulayan').",
  })
  ownScopes!: string[];
}

export class PlatformPolicyListResponse {
  @ApiProperty({ type: [PlatformPolicyResponse] })
  items!: PlatformPolicyResponse[];
}

export class SetPlatformPolicyDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}

export class ScopedPolicyScopeResponse {
  @ApiProperty({ enum: ["KOSK", "MADRASAH"] })
  kind!: "KOSK" | "MADRASAH";

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ScopedPolicyResponse {
  @ApiProperty({ type: ScopedPolicyScopeResponse })
  scope!: ScopedPolicyScopeResponse;

  @ApiProperty({ enum: PLATFORM_POLICY_KEYS, enumName: "PlatformPolicyKey" })
  key!: string;

  @ApiPropertyOptional({
    type: PolicyPersonResponse,
    nullable: true,
    description: "Who switched it on; null when the trail does not say.",
  })
  openedBy!: PolicyPersonResponse | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  openedAt!: Date | null;
}

export class ScopedPolicyListResponse {
  @ApiProperty({ type: [ScopedPolicyResponse] })
  items!: ScopedPolicyResponse[];
}
