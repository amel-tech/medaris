import { ApiProperty } from "@nestjs/swagger";
import {
  NOTIFICATION_TARGET_TYPES,
  NOTIFICATION_TYPES,
} from "../notification-types";

export class NotificationResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({
    enum: NOTIFICATION_TYPES,
    description:
      "What happened. The sentence is not stored: the client words it from this key and `params`, in the reader's language.",
  })
  type!: string;

  @ApiProperty({
    enum: NOTIFICATION_TARGET_TYPES,
    nullable: true,
    description:
      "What the notification leads to. For a SESSION, `params.courseId` names its course.",
  })
  targetType!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  targetId!: string | null;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    example: { courseTitle: "Bina ve İzhar Şerhi", source: "Beyazıt Köşkü" },
    description:
      "Flat values the sentence is filled from (course title, session time, reason, who or where it came from).",
  })
  params!: Record<string, string | number | boolean | null>;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "When the caller read it; null while unread.",
  })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;
}

export class PaginatedNotificationResponse {
  @ApiProperty({ type: NotificationResponse, isArray: true })
  items!: NotificationResponse[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Pass as `cursor` for the next page; null on the last page. Opaque.",
  })
  nextCursor!: string | null;
}

export class NotificationCountsResponse {
  @ApiProperty({ example: 3, description: "Unread — the bell and the tab." })
  unread!: number;

  @ApiProperty({
    example: 6,
    description: "Every notification the caller has.",
  })
  total!: number;
}

export class ReadAllNotificationsResponse {
  @ApiProperty({
    example: 3,
    description: "How many were unread and are read now.",
  })
  updated!: number;
}
