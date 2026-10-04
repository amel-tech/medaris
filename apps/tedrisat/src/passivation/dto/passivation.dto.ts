import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";
import {
  PASSIVATION_SCOPE_TYPES,
  type PassivationScopeType,
} from "../passivation-impact";

export class PassivationScopeResponse {
  @ApiProperty({
    enum: PASSIVATION_SCOPE_TYPES,
    enumName: "PassivationScopeType",
  })
  type!: PassivationScopeType;

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class PassivationCourseResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({
    description:
      "The köşk the course is in; a medrese's courses may be in several",
  })
  koskName!: string;

  @ApiProperty({
    example: "PUBLISHED",
    description: "PUBLISHED or DRAFT; a hidden course is not counted",
  })
  status!: string;

  @ApiProperty({
    description:
      "Someone holds the müderris role in it now, so it is open today and closes with the scope. A course without one is closed already.",
  })
  liveMuderris!: boolean;

  @ApiProperty({ description: "Talebe with the course open" })
  enrolled!: number;

  @ApiProperty({
    description: "Talebe who finished it; they lose the content too",
  })
  completed!: number;
}

export class PassivationCoursesResponse {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  published!: number;

  @ApiProperty()
  draft!: number;

  @ApiProperty({
    description: "How many of them have a müderris in the post now",
  })
  withLiveMuderris!: number;

  @ApiProperty({
    type: PassivationCourseResponse,
    isArray: true,
    description: "The first 50, the most enrolled first",
  })
  items!: PassivationCourseResponse[];

  @ApiProperty({
    description:
      "True when `items` is shorter than `total`; the confirmation covers every course",
  })
  truncated!: boolean;
}

export class PassivationStudentsResponse {
  @ApiProperty({
    description:
      "Distinct talebe enrolled in those courses; one in two courses counts once. An upper bound of who loses access today: courses without a müderris are closed already.",
  })
  enrolled!: number;

  @ApiProperty({ description: "Distinct talebe who finished one of them" })
  completed!: number;
}

export class PassivationSessionResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiProperty({ type: Date })
  scheduledAt!: Date;
}

export class PassivationSessionsResponse {
  @ApiProperty({
    example: 7,
    description:
      "How many days ahead are counted; the screen never hard-codes it",
  })
  windowDays!: number;

  @ApiProperty({
    description:
      "Live sessions of published courses that are not cancelled and start inside the window",
  })
  count!: number;

  @ApiProperty({
    type: PassivationSessionResponse,
    isArray: true,
    description: "The first five",
  })
  next!: PassivationSessionResponse[];
}

export class PassivationImpactResponse {
  @ApiProperty({ type: PassivationScopeResponse })
  scope!: PassivationScopeResponse;

  @ApiProperty({ description: "Already passive: the call answers 409" })
  alreadyPassive!: boolean;

  @ApiProperty({
    description:
      "False when the scope never had a manager: the engine treats it as new, so passivating it closes no course.",
  })
  closesContent!: boolean;

  @ApiProperty({
    description:
      "How many people hold the manager post now and are taken off it (köşk nazımları, or the başmüderris)",
  })
  staffLeaving!: number;

  @ApiProperty({ type: PassivationCoursesResponse })
  courses!: PassivationCoursesResponse;

  @ApiProperty({ type: PassivationStudentsResponse })
  students!: PassivationStudentsResponse;

  @ApiProperty({ type: PassivationSessionsResponse })
  sessions!: PassivationSessionsResponse;

  @ApiProperty({
    description:
      "Post it back as `confirmation` to passivate. It is tied to exactly these numbers and to the caller: anything that changed since, or another caller, gets 409 PASSIVATION_IMPACT_CHANGED.",
  })
  confirmation!: string;
}

export class PassivateScopeDto {
  @ApiProperty({
    description: "The `confirmation` of the preview the person read",
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64)
  confirmation!: string;
}
