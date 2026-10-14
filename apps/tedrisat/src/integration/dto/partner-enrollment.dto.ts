import { ApiProperty } from "@nestjs/swagger";
import { IsUUID, Matches } from "class-validator";
import {
  COURSE_CODE_PATTERN,
  REGISTRATION_REF_PATTERN,
} from "../domain/partner-enrollment";

/** The two path segments of `/integrations/enrollments/{registrationRef}/{courseCode}`. */
export class PartnerEnrollmentParams {
  @ApiProperty({
    example: "R-2026-0042",
    pattern: REGISTRATION_REF_PATTERN.source,
    description: "The partner's registration id.",
  })
  @Matches(REGISTRATION_REF_PATTERN)
  registrationRef!: string;

  @ApiProperty({
    example: "tecvid-2026-guz",
    pattern: COURSE_CODE_PATTERN.source,
    description:
      "The partner's own code for a course or a weekly activity, mapped to a Medaris course in nazar.",
  })
  @Matches(COURSE_CODE_PATTERN)
  courseCode!: string;
}

export class PartnerEnrollDto {
  @ApiProperty({
    example: "623fdf08-fd0e-481b-a927-4a1c15135e62",
    description:
      "The person's Keycloak subject (`sub`), from their sign-in with Medaris on the partner's site. Never an e-mail address.",
  })
  @IsUUID()
  userId!: string;
}

export class PartnerEnrollmentResponse {
  @ApiProperty({
    enum: ["ENROLLED", "ALREADY_ENROLLED"],
    description:
      "`ENROLLED`: this call seated them. `ALREADY_ENROLLED`: they already were, through this registration, another one, or on their own.",
  })
  status!: "ENROLLED" | "ALREADY_ENROLLED";

  @ApiProperty({ format: "uuid" })
  courseId!: string;
}

export class PartnerUnenrollmentResponse {
  @ApiProperty({
    enum: ["REMOVED", "KEPT", "NOT_FOUND"],
    description:
      "`REMOVED`: the registration had seated them and the seat is now taken away through the course team's own removal path (or was gone already). `KEPT`: they are enrolled independently of this registration; the seat stays and the registration is closed. `NOT_FOUND`: there is no such registration.",
  })
  status!: "REMOVED" | "KEPT" | "NOT_FOUND";
}

export class PartnerCourseResponse {
  @ApiProperty({ example: "tecvid-2026-guz" }) code!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty({ example: "Tecvid" }) title!: string;
}
