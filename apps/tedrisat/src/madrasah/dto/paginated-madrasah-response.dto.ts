import { ApiProperty } from "@nestjs/swagger";
import { MadrasahResponse } from "./madrasah-response.dto";

export class PaginatedMadrasahResponse {
  @ApiProperty({ type: MadrasahResponse, isArray: true })
  items!: MadrasahResponse[];

  @ApiProperty({ description: "Total number of medreses", example: 3 })
  total!: number;

  @ApiProperty({ description: "Current page (1-based)", example: 1 })
  page!: number;

  @ApiProperty({ description: "Items per page", example: 12 })
  limit!: number;
}
