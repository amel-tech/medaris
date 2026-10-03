import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { INACTIVE_SCOPE_TYPES } from "../../inactive-scope/inactive-scope.rules";

export const DASHBOARD_VIEWERS = ["CHIEF", "MEDARIS_NAZIM"] as const;
export type DashboardViewer = (typeof DASHBOARD_VIEWERS)[number];

export class DashboardCanResponse {
  @ApiProperty({
    description:
      "The viewer may open a köşk (the başnazım only): the page shows the 'Köşk aç' button.",
  })
  openKosk!: boolean;
}

/**
 * What waits for a decision. A `null` count is a section this viewer is not
 * shown (no permission): it is left out of the greeting's total too.
 */
export class DashboardPendingTotalsResponse {
  @ApiPropertyOptional({ type: Number, nullable: true })
  koskApplications!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  deckPublishRequests!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      "İtirazlar: the appeal model comes with a later phase, so the count is 0 for a viewer who would see it",
  })
  appeals!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      "Kalıcı yasak talepleri: the request model comes with a later phase, so the count is 0 for a viewer who would see it",
  })
  permanentBanRequests!: number | null;
}

export class DashboardPlatformCountsResponse {
  @ApiProperty({ description: "Köşks that are not hidden" })
  kosk!: number;

  @ApiProperty({ description: "Of them, the unlisted ones (Listelenmeyen)" })
  unlistedKosk!: number;

  @ApiProperty({ description: "Medreses that are not hidden" })
  madrasah!: number;

  @ApiProperty({ description: "Of them, the passive ones (no başmüderris)" })
  inactiveMadrasah!: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "Courses that are not hidden; null: not shown to a nazım",
  })
  course!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  inactiveCourse!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      "Distinct talebe enrolled in a course that is not hidden; null: not shown to a nazım",
  })
  enrolledStudents!: number | null;
}

export class NizamDashboardApplicationResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Davutpaşa Köşkü" })
  name!: string;

  @ApiProperty({ example: "AQEEDAH_KALAM" })
  field!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  applicantName!: string | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class DashboardDeckRequestResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  ownerName!: string | null;

  @ApiProperty()
  cardCount!: number;

  @ApiProperty({ type: Date })
  requestedAt!: Date;
}

export class DashboardInactiveScopeResponse {
  @ApiProperty({ enum: INACTIVE_SCOPE_TYPES, enumName: "InactiveScopeType" })
  type!: (typeof INACTIVE_SCOPE_TYPES)[number];

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The köşk of a course; null for a köşk or a medrese",
  })
  koskName!: string | null;

  @ApiProperty({ enum: ["EXPIRED", "REMOVED"], enumName: "InactiveEndReason" })
  reason!: "EXPIRED" | "REMOVED";

  @ApiProperty({ type: Date })
  since!: Date;
}

export class DashboardBanResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  userName!: string | null;

  @ApiProperty({ enum: ["COURSE", "KOSK"], enumName: "BanScope" })
  scope!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The course of a course ban; null for a köşk ban",
  })
  courseTitle!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  koskName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bannedByName!: string | null;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class NizamDashboardResponse {
  @ApiProperty({ enum: DASHBOARD_VIEWERS, enumName: "DashboardViewer" })
  viewer!: DashboardViewer;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The viewer's given name for the greeting; null when unknown",
  })
  greetingName!: string | null;

  @ApiProperty({ type: DashboardCanResponse })
  can!: DashboardCanResponse;

  @ApiProperty({ type: DashboardPendingTotalsResponse })
  pendingTotals!: DashboardPendingTotalsResponse;

  @ApiProperty({ type: DashboardPlatformCountsResponse })
  platformCounts!: DashboardPlatformCountsResponse;

  @ApiPropertyOptional({
    type: NizamDashboardApplicationResponse,
    isArray: true,
    nullable: true,
    description:
      "The newest waiting applications, three at most; null: not shown",
  })
  latestApplications!: NizamDashboardApplicationResponse[] | null;

  @ApiPropertyOptional({
    type: DashboardDeckRequestResponse,
    isArray: true,
    nullable: true,
    description:
      "The newest waiting deck requests, three at most; null: not shown",
  })
  latestDeckRequests!: DashboardDeckRequestResponse[] | null;

  @ApiPropertyOptional({
    type: DashboardInactiveScopeResponse,
    isArray: true,
    nullable: true,
    description: "Passive scopes, oldest first, three at most; null: not shown",
  })
  inactiveScopes!: DashboardInactiveScopeResponse[] | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "How many passive scopes there are in all; null: not shown",
  })
  inactiveScopeCount!: number | null;

  @ApiPropertyOptional({
    type: DashboardBanResponse,
    isArray: true,
    nullable: true,
    description: "The newest open bans, three at most; null: not shown",
  })
  latestBans!: DashboardBanResponse[] | null;
}
