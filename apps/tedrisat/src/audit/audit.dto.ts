import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  AUDIT_SCOPE_KINDS,
  AUDIT_TYPES,
  type AuditScopeKind,
  type AuditType,
} from "./audit-types";

export class AuditQuery {
  @ApiPropertyOptional({
    description:
      "Who did it: a name or e-mail fragment, or the account's id. Matches the people the app has seen.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  actor?: string;

  @ApiPropertyOptional({
    enum: AUDIT_TYPES,
    enumName: "AuditType",
    description: "What they did; omitted means every kind.",
  })
  @IsOptional()
  @IsEnum(AUDIT_TYPES)
  type?: AuditType;

  @ApiPropertyOptional({
    enum: AUDIT_SCOPE_KINDS,
    enumName: "AuditScopeKind",
    description: "Where: the platform, a köşk or a medrese.",
  })
  @IsOptional()
  @IsEnum(AUDIT_SCOPE_KINDS)
  scope?: AuditScopeKind;

  @ApiPropertyOptional({ type: Date, description: "Not before this moment" })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: Date, description: "Not after this moment" })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class AuditPageQuery extends AuditQuery {
  @ApiPropertyOptional({
    description: "`nextCursor` of the previous page; omitted for the first.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;
}

export class AuditActorResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The widest role the person holds now (SYSTEM_ADMIN for the başnazım, read from the realm; otherwise MEDARIS_NAZIM, KOSK_NAZIM, …); null for people who hold none.",
  })
  role!: string | null;
}

export class AuditScopeResponse {
  @ApiProperty({ enum: AUDIT_SCOPE_KINDS, enumName: "AuditScopeKind" })
  kind!: AuditScopeKind;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  id!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}

export class AuditEntryResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ description: "The record's number, the `#no` of the page" })
  number!: number;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: AuditActorResponse })
  actor!: AuditActorResponse;

  @ApiProperty({ enum: AUDIT_TYPES, enumName: "AuditType" })
  type!: AuditType;

  @ApiProperty({
    description: "The stored `<entity>.<verb>`",
    example: "ban.create",
  })
  action!: string;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "What the writer recorded; its keys depend on the action.",
  })
  details!: Record<string, unknown>;

  @ApiProperty({ type: AuditScopeResponse })
  scope!: AuditScopeResponse;
}

export class AuditPageResponse {
  @ApiProperty({ type: [AuditEntryResponse] })
  items!: AuditEntryResponse[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Pass as `cursor` for the older records; null at the end.",
  })
  nextCursor!: string | null;
}
