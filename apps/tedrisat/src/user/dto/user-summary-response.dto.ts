import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UserSummaryResponse {
  @ApiProperty({ description: "The Keycloak subject id" })
  id!: string;

  @ApiPropertyOptional({ type: String })
  givenName!: string | null;

  @ApiPropertyOptional({ type: String })
  familyName!: string | null;

  @ApiPropertyOptional({ type: String })
  email!: string | null;
}
