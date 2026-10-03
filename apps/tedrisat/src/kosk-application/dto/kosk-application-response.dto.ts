import { ApiProperty } from "@nestjs/swagger";
import { KOSK_APPLICATION_STATUSES } from "../../database/schema/kosk-application.schema";

export class KoskApplicationResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: KOSK_APPLICATION_STATUSES, example: "PENDING" })
  status!: string;
}
