import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { KOSK_APPLICATION_FIELDS } from "../../database/schema/kosk-application.schema";

export const KOSK_APPLICATION_TABS = ["PENDING", "DECIDED"] as const;
export type KoskApplicationTab = (typeof KOSK_APPLICATION_TABS)[number];

export class KoskApplicationItemResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Davutpaşa Köşkü" })
  name!: string;

  @ApiProperty({ enum: KOSK_APPLICATION_FIELDS })
  field!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The applicant's name; no contact detail travels in the list.",
  })
  applicantName!: string | null;

  @ApiProperty({ enum: ["PENDING", "APPROVED", "REJECTED"] })
  status!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  decidedAt!: Date | null;
}

export class KoskApplicationListResponse {
  @ApiProperty({ type: [KoskApplicationItemResponse] })
  items!: KoskApplicationItemResponse[];

  @ApiProperty({ description: "The Bekleyen tab's count" })
  pendingCount!: number;

  @ApiProperty({ description: "The Karara bağlanan tab's count" })
  decidedCount!: number;
}

export class KoskApplicantResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ description: "What the applicant typed on the form" })
  email!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Null when not given: the page says 'Verilmedi'.",
  })
  phone!: string | null;

  @ApiProperty({
    type: [String],
    description: "The roles the applicant holds now (KOSK_NAZIM, MUDERRIS, …)",
  })
  roles!: string[];
}

export class KoskApplicationDetailResponse extends KoskApplicationItemResponse {
  @ApiProperty()
  summary!: string;

  @ApiProperty({ description: "'Neden bu köşk'" })
  reason!: string;

  @ApiProperty({ type: KoskApplicantResponse })
  applicant!: KoskApplicantResponse;

  @ApiProperty({
    type: [String],
    description: "Names of the köşks already open in the same field",
  })
  sameFieldKosks!: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectReason!: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  koskId!: string | null;
}

export class ApproveKoskApplicationDto {
  @ApiProperty({
    format: "uuid",
    description:
      "The köşk that was opened from the application with `POST /kosks` (nizam/10); the application is accepted with it.",
  })
  @IsUUID()
  koskId!: string;
}
