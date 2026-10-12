import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsString } from "class-validator";
import { BULK_ENROLL_MAX } from "../domain/bulk-enrollment";

export class BulkEnrollDto {
  @ApiProperty({
    type: [String],
    maxItems: BULK_ENROLL_MAX,
    example: ["ayse@example.com", "Yusuf@Example.com "],
    description:
      "The e-mail addresses of the people to enrol, as typed. Each is trimmed and lower-cased; empty entries and repeats are dropped; one that does not look like an address comes back in `invalid`.",
  })
  @IsArray()
  @ArrayMaxSize(BULK_ENROLL_MAX)
  @IsString({ each: true })
  emails!: string[];
}

export class BulkEnrollmentSkipResponse {
  @ApiProperty({ example: "ayse@example.com" }) email!: string;
  @ApiProperty({
    example: "barred",
    description:
      "`barred` (an open ban bars them from the course), `revoked` (the course team took them out; approve the seat on the roster to put them back), `changed` (their request moved while this one ran), or the status of the enrollment they already hold (`COMPLETED`).",
  })
  reason!: string;
}

export class BulkEnrollmentResponse {
  @ApiProperty({
    type: [String],
    description: "Given an ENROLLED seat: they had no enrollment.",
  })
  enrolled!: string[];
  @ApiProperty({
    type: [String],
    description:
      "Their waiting request was approved, as `POST …/:userId/approve` does, notification included.",
  })
  approved!: string[];
  @ApiProperty({ type: [String], description: "Already enrolled." })
  already!: string[];
  @ApiProperty({
    type: [String],
    description: "No enabled account in the realm has this address.",
  })
  notFound!: string[];
  @ApiProperty({
    type: [String],
    description: "Not an e-mail address; never looked up.",
  })
  invalid!: string[];
  @ApiProperty({ type: () => BulkEnrollmentSkipResponse, isArray: true })
  skipped!: BulkEnrollmentSkipResponse[];
}
