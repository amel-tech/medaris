import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ErrorResponse {
  @ApiProperty({ example: "APP_ERROR" })
  type!: string;

  @ApiProperty({ example: "RESOURCE_NOT_FOUND" })
  code!: string;

  @ApiProperty({ example: 422 })
  status!: number;

  @ApiProperty({ example: "Validation Error" })
  message!: string;

  @ApiPropertyOptional()
  context?: Record<string, any>;

  /**
   * Only set on the UNKNOWN_ERROR branch, where the body is deliberately
   * opaque and this id is what ties a support report to the server-side log.
   */
  @ApiPropertyOptional({ example: "0f1d2c3b-4a59-4c6d-8e7f-90a1b2c3d4e5" })
  correlationId?: string;

  @ApiProperty({ example: "2025-01-01T00:00:00.000Z" })
  timestamp!: string;
}
