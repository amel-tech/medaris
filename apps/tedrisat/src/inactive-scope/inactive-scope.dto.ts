import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional, IsUUID } from "class-validator";
import { INACTIVE_SCOPE_TYPES } from "./inactive-scope.rules";

export const END_REASONS = ["EXPIRED", "REMOVED"] as const;

export const REMOVER_ROLES = [
  "SYSTEM_ADMIN",
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
] as const;

export class InactivePersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;
}

export class InactiveKoskRefResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class InactiveScopeResponse {
  @ApiProperty({ enum: INACTIVE_SCOPE_TYPES, enumName: "InactiveScopeType" })
  type!: (typeof INACTIVE_SCOPE_TYPES)[number];

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Zeyrek Medresesi" })
  name!: string;

  @ApiPropertyOptional({
    type: InactiveKoskRefResponse,
    nullable: true,
    description: "The köşk of a course; null for a köşk or a medrese",
  })
  kosk!: InactiveKoskRefResponse | null;

  @ApiProperty({
    enum: END_REASONS,
    enumName: "InactiveEndReason",
    description:
      "EXPIRED: the last manager's term ran out; REMOVED: somebody took it away",
  })
  reason!: (typeof END_REASONS)[number];

  @ApiProperty({
    type: Date,
    description:
      "When the last manager's post ended: the scope's passive since",
  })
  since!: Date;

  @ApiPropertyOptional({ type: InactivePersonResponse, nullable: true })
  lastManager!: InactivePersonResponse | null;

  @ApiProperty({
    description:
      "KOSK_NAZIM, MEDRESE_BASMUDERRIS or MUDERRIS: what the last manager was",
  })
  lastRole!: string;

  @ApiProperty({ description: "The last müderris of a course was its imam" })
  wasImam!: boolean;

  @ApiPropertyOptional({
    type: InactivePersonResponse,
    nullable: true,
    description: "Who took the post away; null when it ran out",
  })
  removedBy!: InactivePersonResponse | null;

  @ApiPropertyOptional({
    enum: REMOVER_ROLES,
    enumName: "InactiveRemoverRole",
    nullable: true,
    description: "What the remover is, worked out when read",
  })
  removedByRole!: (typeof REMOVER_ROLES)[number] | null;
}

export class AssignInactiveScopeDto {
  @ApiProperty({
    format: "uuid",
    description: "The account that takes the scope over (`GET /users/lookup`)",
  })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description: "Görev bitişi. Omitted: until taken away. In the past: 400.",
  })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
