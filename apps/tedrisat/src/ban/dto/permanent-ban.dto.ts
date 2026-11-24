import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import {
  BAN_SCOPES,
  PERMANENT_BAN_NOTE_MAX,
  PERMANENT_BAN_REQUEST_STATUSES,
} from "../../database/schema/ban.schema";
import { BanPersonResponse } from "./ban.dto";

export const PERMANENT_BAN_TABS = ["PENDING", "DECIDED"] as const;
export type PermanentBanTab = (typeof PERMANENT_BAN_TABS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class RejectPermanentBanRequestDto {
  @ApiProperty({
    maxLength: PERMANENT_BAN_NOTE_MAX,
    description:
      "Why the request is refused. Read by whoever asked. Required, and not blank.",
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PERMANENT_BAN_NOTE_MAX)
  note!: string;
}

/** The ban a request asks to make permanent, as the card's "Mevcut yasak" reads it. */
export class PermanentBanRequestBanResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: () => BanPersonResponse })
  user!: BanPersonResponse;

  @ApiProperty({ enum: Object.values(BAN_SCOPES), enumName: "BanScope" })
  scope!: string;

  @ApiProperty({ type: String, nullable: true })
  koskName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  courseTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  madrasahName!: string | null;

  @ApiProperty({ description: "Why the lower ban was placed." })
  reason!: string;

  @ApiProperty({ type: () => BanPersonResponse })
  bannedBy!: BanPersonResponse;

  @ApiProperty({
    description: "The role the banner acted in. The client words it.",
  })
  bannedRole!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description:
      "Set when the ban was lifted meanwhile: such a request can be refused, not approved.",
  })
  liftedAt!: Date | null;
}

export class PermanentBanRequestResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: PERMANENT_BAN_REQUEST_STATUSES })
  status!: string;

  @ApiProperty({ description: "Why the requester asks for a permanent ban." })
  reason!: string;

  @ApiProperty({ type: () => BanPersonResponse })
  requestedBy!: BanPersonResponse;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ type: () => BanPersonResponse, nullable: true })
  decidedBy!: BanPersonResponse | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  decidedAt!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The note of a refusal; null for an approval.",
  })
  decisionNote!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The PLATFORM ban an approval opened, or the one that stood already.",
  })
  platformBanId!: string | null;

  @ApiProperty({ type: () => PermanentBanRequestBanResponse })
  ban!: PermanentBanRequestBanResponse;
}

export class PermanentBanRequestListResponse {
  @ApiProperty({ type: () => PermanentBanRequestResponse, isArray: true })
  items!: PermanentBanRequestResponse[];

  @ApiProperty({ description: "Requests waiting for a decision." })
  pendingCount!: number;

  @ApiProperty({ description: "Requests approved or refused." })
  decidedCount!: number;
}
