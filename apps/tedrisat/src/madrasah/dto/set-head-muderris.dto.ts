import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class SetHeadMuderrisDto {
  @ApiProperty({
    format: "uuid",
    description: "The account that becomes the başmüderris",
  })
  @IsUUID()
  userId!: string;
}
