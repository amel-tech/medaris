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

  @ApiProperty({ description: "The SYSTEM_ADMIN who created it" })
  createdBy!: string;

  @ApiProperty({
    type: [String],
    description: "User ids of the medrese's nazırs, oldest first",
  })
  nazirIds!: string[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
