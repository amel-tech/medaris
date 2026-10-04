import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
      "Medreses the caller is nazır of. Always empty until tedrisat stores medrese nazırs.",
  })
  nazirOf!: NazirMadrasahRef[];

  @ApiProperty({ type: [ManagedKoskRef] })
  manages!: ManagedKoskRef[];

  @ApiProperty({ type: [TaughtCourseRef] })
  teaches!: TaughtCourseRef[];
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

  @ApiProperty({
    description:
      "Whether lesson invitations, their updates and cancellations are e-mailed to the caller (MDRS-121)",
  })
  lessonInvitationEmails!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  lastSeenAt!: Date;

  @ApiProperty({ type: MeRolesResponse })
  roles!: MeRolesResponse;
}
