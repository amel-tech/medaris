import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MadrasahResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "hadis-ve-siyer" })
  handle!: string;

  @ApiProperty({ example: "Hadis ve Siyer Araştırmaları Medresesi" })
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ example: 215 })
  coverHue!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The SYSTEM_ADMIN who created it. Null for a caller with no token (MDRS-160)",
  })
  createdBy!: string | null;

  @ApiProperty({
    type: [String],
    description:
      "User ids of the medrese's nazırs, oldest first. Empty for a caller with no token (MDRS-160)",
  })
  nazirIds!: string[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
