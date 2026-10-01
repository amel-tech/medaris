import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, MaxLength } from "class-validator";

export class FindUserByEmailQuery {
  @ApiProperty({
    example: "muderris@example.com",
    description: "Matched exactly (case-insensitively), never as a prefix",
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
