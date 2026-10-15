import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";
import { PARTNER_CLIENT_ID_PATTERN } from "../../config/integration-partners-env";
import { PARTNER_NAME_MAX } from "../domain/partner-registry";

/** More köşks than any partner is bound to; a bound on the body's size. */
const MAX_KOSKS = 1000;

export class PartnerKoskResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ example: "Örnek Köşkü" }) name!: string;
}

/** A partner application as nizam's "Ortak uygulamalar" lists it. */
export class PartnerAdminResponse {
  @ApiProperty({
    example: "ornek-uygulama",
    description: "Its client id in the realm: what its tokens carry in `azp`.",
  })
  clientId!: string;

  @ApiProperty({ example: "Örnek Uygulama" })
  name!: string;

  @ApiProperty({
    description:
      "A disabled partner's token is refused on `/integrations/*` (403 PARTNER_DISABLED), and its codes are offered in no course.",
  })
  enabled!: boolean;

  @ApiProperty() createdAt!: Date;

  @ApiProperty({
    type: () => PartnerKoskResponse,
    isArray: true,
    description: "The köşks it works with, by name.",
  })
  kosks!: PartnerKoskResponse[];
}

export class PartnerAdminListResponse {
  @ApiProperty({ type: () => PartnerAdminResponse, isArray: true })
  items!: PartnerAdminResponse[];

  @ApiProperty({
    type: () => PartnerKoskResponse,
    isArray: true,
    description: "Every köşk, by name: what a partner's köşks are picked from.",
  })
  kosks!: PartnerKoskResponse[];
}

export class CreatePartnerDto {
  @ApiProperty({
    example: "ornek-uygulama",
    pattern: PARTNER_CLIENT_ID_PATTERN.source,
    description:
      "The partner's client id in the realm. Never one of the front-ends in KEYCLOAK_ALLOWED_CLIENTS.",
  })
  @Matches(PARTNER_CLIENT_ID_PATTERN)
  clientId!: string;

  @ApiProperty({ example: "Örnek Uygulama", maxLength: PARTNER_NAME_MAX })
  @IsString()
  @MaxLength(PARTNER_NAME_MAX)
  @Matches(/\S/, { message: "name must not be blank" })
  name!: string;
}

export class UpdatePartnerDto {
  @ApiPropertyOptional({
    example: "Örnek Uygulama",
    maxLength: PARTNER_NAME_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PARTNER_NAME_MAX)
  @Matches(/\S/, { message: "name must not be blank" })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SetPartnerKosksDto {
  @ApiProperty({
    type: String,
    format: "uuid",
    isArray: true,
    description:
      "Every köşk the partner works with from now on; the ones left out are unbound.",
  })
  @IsArray()
  @ArrayMaxSize(MAX_KOSKS)
  @IsUUID("all", { each: true })
  koskIds!: string[];
}

/** The path of `/nizam/partner-applications/{clientId}…`. */
export class PartnerClientParams {
  @ApiProperty({ example: "ornek-uygulama" })
  @Matches(PARTNER_CLIENT_ID_PATTERN)
  clientId!: string;
}
