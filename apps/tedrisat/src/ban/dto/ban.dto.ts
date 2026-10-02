import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { BAN_SCOPES } from "../../database/schema/ban.schema";

export const BAN_REASON_MAX = 500;

export class CreateBanDto {
  @ApiProperty({ format: "uuid", description: "The talebe to bar." })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: Object.values(BAN_SCOPES),
    enumName: "BanScope",
    description:
      "COURSE bars the talebe from this course alone; KOSK from every course of its köşk, and they may not apply again. KOSK is the köşk nazımı's and above.",
  })
  @IsIn(Object.values(BAN_SCOPES))
  scope!: string;

  @ApiProperty({
    maxLength: BAN_REASON_MAX,
    example: "Celselerde başka talebelere hakaret.",
    description:
      "Read by whoever sees the ban and by whoever lifts it; never sent to the talebe. Required, and not blank.",
  })
  @IsString()
  @MaxLength(BAN_REASON_MAX)
  @Matches(/\S/, { message: "reason must not be blank" })
  reason!: string;
}

export class LiftBanDto {
  @ApiProperty({
    maxLength: BAN_REASON_MAX,
    example: "Talebeyle görüşüldü; celse âdâbına uyacağına söz verdi.",
    description:
      "Kept with the ban and the lifter's name. Required, and not blank.",
  })
  @IsString()
  @MaxLength(BAN_REASON_MAX)
  @Matches(/\S/, { message: "reason must not be blank" })
  reason!: string;
}

export const BAN_STATUSES = ["ACTIVE", "LIFTED"] as const;
export type BanStatus = (typeof BAN_STATUSES)[number];

export class BanPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Null when the account never signed in to tedrisat.",
  })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;
}

export class BanResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: () => BanPersonResponse })
  user!: BanPersonResponse;

  @ApiProperty({ enum: Object.values(BAN_SCOPES), enumName: "BanScope" })
  scope!: string;

  @ApiProperty({ format: "uuid" })
  koskId!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  courseId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  courseTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  madrasahName!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "For a KOSK ban widened from a course: that course. Null otherwise.",
  })
  extendedFromCourseId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  extendedFromCourseTitle!: string | null;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: () => BanPersonResponse })
  bannedBy!: BanPersonResponse;

  @ApiProperty({
    description:
      "The role the banner acted in (KOSK_NAZIM, MUDERRIS, DERS_NAZIR, MEDRESE_NAZIR, MEDRESE_BASMUDERRIS, MEDARIS_NAZIM or SYSTEM_ADMIN). The client words it.",
  })
  bannedRole!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  liftedAt!: Date | null;

  @ApiProperty({ type: () => BanPersonResponse, nullable: true })
  liftedBy!: BanPersonResponse | null;

  @ApiProperty({ type: String, nullable: true })
  liftReason!: string | null;

  @ApiProperty({
    description:
      "Whether the caller's kademe reaches the ban's: false means the row shows no lift button (the server refuses with 403 all the same).",
  })
  viewerMayLift!: boolean;

  @ApiProperty({
    description:
      "Whether the caller may widen this course ban to the whole köşk: a köşk nazımı or above, on an open course ban with no open köşk ban for the person.",
  })
  viewerMayExtend!: boolean;
}

export class BanListResponse {
  @ApiProperty({ type: () => BanResponse, isArray: true })
  items!: BanResponse[];

  @ApiProperty({ description: "Open bans in the köşk." })
  activeCount!: number;

  @ApiProperty({ description: "Lifted bans in the köşk." })
  liftedCount!: number;

  @ApiProperty({ description: "Open bans placed in the last 24 hours." })
  recentCount!: number;
}
