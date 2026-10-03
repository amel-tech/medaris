import { applyDecorators } from "@nestjs/common";
import { ApiProperty, OmitType } from "@nestjs/swagger";
import {
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { BAN_SCOPES } from "../../database/schema/ban.schema";
import { BAN_REASON_MAX, BanResponse } from "./ban.dto";

/** What a nazır places a ban over: one of the medrese's courses, or the whole medrese. */
export const MADRASAH_BAN_SCOPES = [
  BAN_SCOPES.COURSE,
  BAN_SCOPES.MADRASAH,
] as const;

const reasonField = (description: string, example: string) =>
  applyDecorators(
    ApiProperty({ maxLength: BAN_REASON_MAX, example, description }),
    IsString(),
    MaxLength(BAN_REASON_MAX),
    Matches(/\S/, { message: "reason must not be blank" })
  );

export class CreateMadrasahBanDto {
  @ApiProperty({ format: "uuid", description: "The talebe to bar." })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: MADRASAH_BAN_SCOPES,
    description:
      "COURSE bars the talebe from one course of the medrese, named in `courseId`; MADRASAH from every course of the medrese, present and future.",
  })
  @IsIn(MADRASAH_BAN_SCOPES)
  scope!: string;

  @ApiProperty({
    format: "uuid",
    required: false,
    description:
      "Required for COURSE, and a course of this medrese. Ignored for MADRASAH.",
  })
  @ValidateIf((o: CreateMadrasahBanDto) => o.scope === BAN_SCOPES.COURSE)
  @IsUUID()
  courseId?: string;

  @reasonField(
    "Read by whoever sees the ban and by whoever lifts it; never sent to the talebe. Required, and not blank.",
    "Celselerde başka talebelere hakaret."
  )
  reason!: string;
}

/**
 * The reason of a decision on an existing ban: widening it to the medrese, or
 * asking for it to be permanent. Kept with what the decision writes, for those
 * who read it; never sent to the talebe.
 */
export class BanReasonDto {
  @reasonField(
    "Why. Kept with the new ban or the request, for whoever reads it later. Required, and not blank.",
    "Başka derslerde de aynı davranış sürdü."
  )
  reason!: string;
}

/**
 * A ban as the nazır portal lists it. `viewerMayExtend` of the köşk's list
 * widens a course ban to the köşk, which no nazır may; here the widening is to
 * the medrese, so it is `viewerMayEscalate`.
 */
export class MadrasahBanResponse extends OmitType(BanResponse, [
  "viewerMayExtend",
] as const) {
  @ApiProperty({
    description:
      "Whether the caller may widen this course ban to the whole medrese (`POST /bans/:banId/escalate`): a medrese nazır or above, on an open course ban in a course of the medrese, with no open medrese-wide ban for the person.",
  })
  viewerMayEscalate!: boolean;

  @ApiProperty({
    description:
      "Whether the caller may ask for the ban to be permanent (`POST /bans/:banId/permanent-request`): a medrese nazır or above, on an open ban that is not Medaris administration's own and has no request yet.",
  })
  viewerMayRequestPermanent!: boolean;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description:
      "When the medrese asked for the ban to be permanent; null when it has not. The request is not decided yet: deciding is Medaris administration's, a later phase.",
  })
  permanentRequestedAt!: Date | null;
}

export class MadrasahBanListResponse {
  @ApiProperty({ type: () => MadrasahBanResponse, isArray: true })
  items!: MadrasahBanResponse[];

  @ApiProperty({ description: "Open bans of the medrese." })
  activeCount!: number;

  @ApiProperty({ description: "Lifted bans of the medrese." })
  liftedCount!: number;

  @ApiProperty({ description: "Open bans placed in the last 24 hours." })
  recentCount!: number;
}
