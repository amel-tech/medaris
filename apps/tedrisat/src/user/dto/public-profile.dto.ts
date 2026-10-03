import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { PROFILE_GENDERS } from "../../database/schema/user-profile.schema";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** Which of the optional fields other people may see. */
export class ProfileVisibility {
  @ApiProperty({ description: "Ad ve soyad" })
  fullName!: boolean;

  @ApiProperty()
  city!: boolean;

  @ApiProperty({ description: "Hakkında" })
  about!: boolean;

  @ApiProperty({ description: "Derslerin" })
  courses!: boolean;
}

export class UpdateProfileVisibilityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  fullName?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  city?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  about?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  courses?: boolean;
}

/** The caller's own view: every field, hidden or not, plus what each switch decides. */
export class MyPublicProfileResponse {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "İlmî künye. Null until the person chooses one.",
  })
  kunye!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: PROFILE_GENDERS,
  })
  gender!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  city!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  about!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The name from the account, as shown on Hesap",
  })
  fullName!: string | null;

  @ApiProperty({
    type: [String],
    description:
      "Titles of the published courses the caller is enrolled in or has completed",
  })
  courses!: string[];

  @ApiProperty({ type: ProfileVisibility })
  visibility!: ProfileVisibility;
}

/** What anyone signed in may read: the künye and gender, and only the fields switched on. */
export class PublicProfileResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  kunye!: string;

  @ApiPropertyOptional({ type: String, nullable: true, enum: PROFILE_GENDERS })
  gender!: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "Present only while the owner shows it",
  })
  fullName?: string;

  @ApiPropertyOptional({
    type: String,
    description: "Present only while the owner shows it",
  })
  city?: string;

  @ApiPropertyOptional({
    type: String,
    description: "Present only while the owner shows it",
  })
  about?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "Present only while the owner shows it",
  })
  courses?: string[];
}

export class UpdatePublicProfileDto {
  @ApiPropertyOptional({ maxLength: 60, description: "İlmî künye" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  kunye?: string;

  @ApiPropertyOptional({
    enum: PROFILE_GENDERS,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsIn(PROFILE_GENDERS)
  gender?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  about?: string | null;

  @ApiPropertyOptional({ type: UpdateProfileVisibilityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProfileVisibilityDto)
  visibility?: UpdateProfileVisibilityDto;
}
