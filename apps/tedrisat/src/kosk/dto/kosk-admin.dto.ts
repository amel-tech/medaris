import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsOptional,
  IsUUID,
} from "class-validator";
import { KOSK_MANAGERS_MAX } from "./kosk-field-rules";

export const KOSK_STATUSES = ["ACTIVE", "PASSIVE", "HIDDEN"] as const;
export type KoskStatus = (typeof KOSK_STATUSES)[number];

export const KOSK_STATUS_FILTERS = ["ALL", ...KOSK_STATUSES] as const;
export type KoskStatusFilter = (typeof KOSK_STATUS_FILTERS)[number];

/** nizam/09's Görünürlük chips: "Tümü", "Listelenen", "Listelenmeyen". */
export const KOSK_LISTING_FILTERS = ["ALL", "LISTED", "UNLISTED"] as const;
export type KoskListingFilter = (typeof KOSK_LISTING_FILTERS)[number];

export class KoskPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Null when neither the app nor the directory knows the name",
  })
  name!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;
}

export class KoskDirectoryItemResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The short name, without a leading @",
    example: "nuruosmaniye",
  })
  handle!: string | null;

  @ApiProperty({ example: "Nûruosmaniye Köşkü" })
  name!: string;

  @ApiProperty({ example: 215 })
  coverHue!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  field!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  level!: string | null;

  @ApiProperty({ description: "Unlisted: shown as Listelenmeyen" })
  isPrivate!: boolean;

  @ApiProperty({
    enum: KOSK_STATUSES,
    enumName: "KoskStatus",
    description:
      "HIDDEN wins over PASSIVE: someone hid it, which says more than that nobody attends it.",
  })
  status!: KoskStatus;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: "Since when it is hidden or passive; null while active",
  })
  since!: Date | null;

  @ApiProperty({
    type: KoskPersonResponse,
    isArray: true,
    description: "The köşk nazımları held now, oldest grant first",
  })
  nazims!: KoskPersonResponse[];

  @ApiProperty({
    description:
      "Every course of the köşk, drafts, hidden and passive ones too",
  })
  courseCount!: number;
}

export class KoskDirectoryCountsResponse {
  @ApiProperty() all!: number;
  @ApiProperty() active!: number;
  @ApiProperty() passive!: number;
  @ApiProperty() hidden!: number;
}

export class KoskDirectoryResponse {
  @ApiProperty({ type: KoskDirectoryItemResponse, isArray: true })
  items!: KoskDirectoryItemResponse[];

  @ApiProperty({ description: "Rows matching every filter" })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  limit!: number;

  @ApiProperty({
    type: KoskDirectoryCountsResponse,
    description:
      "The caller's köşks by status, whatever the filters and search: the tabs' numbers",
  })
  counts!: KoskDirectoryCountsResponse;

  @ApiProperty({
    type: [String],
    description:
      "The fields (alan) the caller's köşks carry, for the Alan chips; alphabetical",
  })
  fields!: string[];
}

export const KOSK_NAZIM_GRANTER_ROLES = [
  "SYSTEM_ADMIN",
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
] as const;
export type KoskNazimGranterRole = (typeof KOSK_NAZIM_GRANTER_ROLES)[number];

export class KoskNazimResponse {
  @ApiProperty({ type: KoskPersonResponse })
  user!: KoskPersonResponse;

  @ApiProperty({ type: KoskPersonResponse })
  grantedBy!: KoskPersonResponse;

  @ApiPropertyOptional({
    enum: KOSK_NAZIM_GRANTER_ROLES,
    enumName: "KoskNazimGranterRole",
    nullable: true,
    description:
      "What the giver is, worked out when read: the realm's başnazım, a Medaris nazımı, or a nazım of this köşk. Null when it cannot be told.",
  })
  grantedByRole!: KoskNazimGranterRole | null;

  @ApiProperty({ type: Date })
  grantedAt!: Date;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: "When the post ends; null means until it is taken away",
  })
  endsAt!: Date | null;
}

export class AddKoskNazimsDto {
  @ApiProperty({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: KOSK_MANAGERS_MAX,
    description: "Accounts found by e-mail (`GET /users/lookup`)",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(KOSK_MANAGERS_MAX)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  userIds!: string[];

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description:
      "Görev bitişi. Omitted: until the nazım is taken away. In the past: 400.",
  })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
