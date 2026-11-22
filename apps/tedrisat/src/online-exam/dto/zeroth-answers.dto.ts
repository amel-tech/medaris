import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDate, IsOptional, IsUUID } from "class-validator";

/**
 * The span and the place of nizam's "Sıfırıncı soru cevapları" (MDRS-299).
 * The span is two moments, as the audit trail's: the page turns its two days
 * into the start of the first and the end of the second in the viewer's zone.
 */
export class ZerothAnswersQuery {
  @ApiProperty({
    type: Date,
    description: "Exams whose celse is not before this moment.",
  })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({
    type: Date,
    description: "Exams whose celse is not after this moment.",
  })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "One köşk. Omitted: every köşk the caller reads, which is all of them for platform management and their own for a köşk nazımı.",
  })
  @IsOptional()
  @IsUUID()
  koskId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "One medrese's courses.",
  })
  @IsOptional()
  @IsUUID()
  madrasahId?: string;

  @ApiPropertyOptional({ format: "uuid", description: "One course." })
  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export class ZerothOptionCountResponse {
  @ApiProperty() text!: string;
  @ApiProperty({ description: "How many talebe chose it." }) count!: number;
}

/** A zeroth question over every exam of the span and the place that asked it in the same words. */
export class ZerothQuestionCountsResponse {
  @ApiProperty({
    description:
      "Names the question in `GET /nizam/exam-zeroth-answers/{questionKey}`.",
  })
  questionKey!: string;
  @ApiProperty() question!: string;
  @ApiProperty({ description: "How many exams asked it." }) exams!: number;
  @ApiProperty({ description: "How many talebe answered it." })
  answered!: number;
  @ApiProperty({
    type: [ZerothOptionCountResponse],
    description: "Its options in their order, with how many chose each.",
  })
  options!: ZerothOptionCountResponse[];
}

/** A course that held a published online exam: the filters' choices. */
export class ZerothCourseResponse {
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty({ format: "uuid" }) koskId!: string;
  @ApiProperty() koskName!: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  madrasahId!: string | null;
  @ApiProperty({ type: String, nullable: true }) madrasahName!: string | null;
}

export class ZerothAnswerCountsResponse {
  @ApiProperty({
    type: [ZerothQuestionCountsResponse],
    description: "Newest exam first.",
  })
  questions!: ZerothQuestionCountsResponse[];

  @ApiProperty({
    type: [ZerothCourseResponse],
    description:
      "Every course of the köşks the caller reads that held a published online exam, whenever: what the köşk, medrese and course fields offer.",
  })
  courses!: ZerothCourseResponse[];

  @ApiProperty({
    description:
      'Whether the caller reads every köşk ("Bütün köşkler"); false for a köşk nazımı, who reads their own.',
  })
  everyKosk!: boolean;
}

/** One exam that asked the question: a row of the table. */
export class ZerothExamCountsResponse {
  @ApiProperty({ format: "uuid" }) examId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty() koskName!: string;
  @ApiProperty({ type: Date, description: "Its celse's time." })
  startsAt!: Date;
  @ApiProperty({ description: "How many talebe answered it in this exam." })
  answered!: number;
  @ApiProperty({
    type: [Number],
    description: "A count per option, in the order of the question's options.",
  })
  options!: number[];
}

export class ZerothQuestionExamsResponse {
  @ApiProperty() questionKey!: string;
  @ApiProperty() question!: string;
  @ApiProperty({ description: "Over every exam: the same as the list shows." })
  answered!: number;
  @ApiProperty({
    type: [ZerothOptionCountResponse],
    description: "Over every exam, as the list shows them.",
  })
  options!: ZerothOptionCountResponse[];
  @ApiProperty({
    type: [ZerothExamCountsResponse],
    description: "Newest first.",
  })
  exams!: ZerothExamCountsResponse[];
}
