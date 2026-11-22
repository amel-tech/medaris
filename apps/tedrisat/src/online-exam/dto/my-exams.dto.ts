import { ApiProperty } from "@nestjs/swagger";
import { AttemptStatus, FinishedBy } from "../domain/exam-attempt";
import { QuestionOutcome } from "../domain/exam-result";
import { MyExamFormat, MyExamState } from "../domain/my-exams";

/** One exam of the caller's courses, as Sınavlarım lists it. */
export class MyExamResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty({
    description:
      "An online exam's own title; a written or oral exam's celse title.",
  })
  title!: string;
  @ApiProperty({ enum: MyExamFormat, enumName: "MyExamFormat" })
  format!: MyExamFormat;
  @ApiProperty({ type: String, format: "date-time" }) startsAt!: Date;
  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "An online exam's latest start; null for any other.",
  })
  latestStartAt!: Date | null;
  @ApiProperty({ enum: MyExamState, enumName: "MyExamState" })
  state!: MyExamState;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Only once released: an online exam's score out of 100 with two decimals (\"85.50\"), a written or oral one's whole score out of `maxScore`.",
  })
  score!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "What the score is out of; 100 for an online exam.",
  })
  maxScore!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "An online exam's length in minutes.",
  })
  durationMinutes!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "An online exam's question count.",
  })
  questionCount!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "A written or oral exam's place, as the team typed it.",
  })
  place!: string | null;
}

export class MyExamCountsResponse {
  @ApiProperty() right!: number;
  @ApiProperty() wrong!: number;
  @ApiProperty() blank!: number;
}

/** A topic of the exam, as the talebe stands in it. */
export class MyTopicStandingResponse {
  @ApiProperty({ format: "uuid" }) topicId!: string;
  @ApiProperty() number!: number;
  @ApiProperty() name!: string;
  @ApiProperty({
    minimum: 0,
    maximum: 100,
    description:
      "The points of the topic's questions that were got, as a whole percentage.",
  })
  percent!: number;
  @ApiProperty() right!: number;
  @ApiProperty() wrong!: number;
  @ApiProperty() blank!: number;
}

/** A topic of the course, over every released exam of the caller's that asked about it. */
export class MyCourseTopicStandingResponse {
  @ApiProperty({ format: "uuid" }) topicId!: string;
  @ApiProperty() number!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ minimum: 0, maximum: 100 }) percent!: number;
  @ApiProperty({
    minimum: 1,
    description: "How many exams it is counted from.",
  })
  exams!: number;
}

export class MyAnsweredOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() chosen!: boolean;
  @ApiProperty() correct!: boolean;
}

/** A question as the talebe reads it again, with their answer and the correct options. */
export class MyAnsweredQuestionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ description: "1 for the first, in this talebe's order." })
  number!: number;
  @ApiProperty() text!: string;
  @ApiProperty({ enum: QuestionOutcome, enumName: "QuestionOutcome" })
  outcome!: QuestionOutcome;
  @ApiProperty({ description: 'Its points, with two decimals ("33.33").' })
  points!: string;
  @ApiProperty({ description: 'What the answer got of them ("33.33").' })
  got!: string;
  @ApiProperty({
    type: [MyAnsweredOptionResponse],
    description: "In this talebe's order.",
  })
  options!: MyAnsweredOptionResponse[];
}

/** A talebe's own screen of a past online exam. */
export class MyExamResultResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: AttemptStatus, enumName: "AttemptStatus" })
  status!: AttemptStatus;
  @ApiProperty({ type: String, format: "date-time" }) startedAt!: Date;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: Date | null;
  @ApiProperty({
    enum: FinishedBy,
    enumName: "FinishedBy",
    nullable: true,
  })
  finishedBy!: FinishedBy | null;
  @ApiProperty({ description: "The course team released the results." })
  released!: boolean;
  @ApiProperty({
    description:
      "The exam has closed for everyone: closed early, or past its latest start with no attempt in progress.",
  })
  closed!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Only when released: out of 100, with two decimals ("85.50").',
  })
  score!: string | null;
  @ApiProperty({ type: MyExamCountsResponse, nullable: true })
  counts!: MyExamCountsResponse | null;
  @ApiProperty({
    type: [MyTopicStandingResponse],
    description:
      "Only when released, the weakest first; a question with two topics counts in both.",
  })
  topics!: MyTopicStandingResponse[];
  @ApiProperty({
    type: [MyCourseTopicStandingResponse],
    description:
      "Only when released: each topic of the course over the caller's released exams of it, the weakest first.",
  })
  courseTopics!: MyCourseTopicStandingResponse[];
  @ApiProperty({
    type: [MyAnsweredQuestionResponse],
    nullable: true,
    description:
      "Only when released and closed for everyone, in the talebe's own order.",
  })
  questions!: MyAnsweredQuestionResponse[] | null;
}
