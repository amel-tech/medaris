import { ApiProperty } from "@nestjs/swagger";
import { FinishedBy } from "../domain/exam-attempt";
import { AnswerVerdict, TalebeExamState } from "../domain/exam-results";
import { AnswerMode, Scoring } from "../domain/online-exam";

export class ResultsExamResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty({
    format: "uuid",
    description:
      "The exam's celse; `releaseExamResults` takes it to release the results.",
  })
  lessonId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty({ type: String, format: "date-time" }) startsAt!: Date;
  @ApiProperty({ type: String, format: "date-time" }) latestStartAt!: Date;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  closedEarlyAt!: Date | null;
  @ApiProperty({
    description:
      "Closed early, or past its latest start with no attempt in progress: the page stops reading again.",
  })
  closed!: boolean;
  @ApiProperty({
    description:
      "The team may close it early: it has opened, and someone may still start it or is still in it.",
  })
  mayClose!: boolean;
}

export class ResultsSwitchResponse {
  @ApiProperty({ type: String, format: "date-time" }) at!: Date;
}

export class ResultsTopicStandingResponse {
  @ApiProperty({ format: "uuid" }) topicId!: string;
  @ApiProperty({ type: Number, nullable: true }) percent!: number | null;
}

export class ResultsTalebeResponse {
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ enum: TalebeExamState, enumName: "TalebeExamState" })
  state!: TalebeExamState;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startedAt!: Date | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: Date | null;
  @ApiProperty({
    enum: FinishedBy,
    enumName: "FinishedBy",
    nullable: true,
  })
  finishedBy!: FinishedBy | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Out of 100 with two decimals, "87.50"; null until finished.',
  })
  score!: string | null;
  @ApiProperty({ type: Number, nullable: true }) right!: number | null;
  @ApiProperty({ type: Number, nullable: true }) wrong!: number | null;
  @ApiProperty({ type: Number, nullable: true }) blank!: number | null;
  @ApiProperty({
    type: [ResultsSwitchResponse],
    description:
      "Each switch to another tab or window, oldest first; nothing was erased by any.",
  })
  switches!: ResultsSwitchResponse[];
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  zerothOptionId!: string | null;
  @ApiProperty({
    type: [ResultsTopicStandingResponse],
    description: "The talebe's standing in each topic, once finished.",
  })
  topics!: ResultsTopicStandingResponse[];
}

export class ResultsCountsResponse {
  @ApiProperty() seats!: number;
  @ApiProperty() started!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() finished!: number;
  @ApiProperty({
    description: "Seated talebe who never started, once it has closed.",
  })
  missed!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The average of the finished scores, two decimals; null when none finished.",
  })
  average!: string | null;
}

export class ResultsTopicResponse {
  @ApiProperty({ format: "uuid" }) topicId!: string;
  @ApiProperty() number!: number;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "The average of the finished talebe's standing in it.",
  })
  percent!: number | null;
  @ApiProperty() questionCount!: number;
}

export class ResultsOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() correct!: boolean;
  @ApiProperty({ description: "How many finished talebe chose it." })
  chosen!: number;
}

export class ResultsQuestionResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty() number!: number;
  @ApiProperty() text!: string;
  @ApiProperty({ enum: AnswerMode, enumName: "AnswerMode" })
  answerMode!: AnswerMode;
  @ApiProperty({ description: 'Its points, "2.00".' }) points!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "The share of finished talebe who earned all of its points.",
  })
  rightPercent!: number | null;
  @ApiProperty({ description: "How many finished talebe left it blank." })
  blank!: number;
  @ApiProperty({ type: [ResultsOptionResponse] })
  options!: ResultsOptionResponse[];
}

export class ResultsZerothOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() count!: number;
}

export class ResultsZerothResponse {
  @ApiProperty() question!: string;
  @ApiProperty({ type: [ResultsZerothOptionResponse] })
  options!: ResultsZerothOptionResponse[];
}

/** One read draws the whole results page of nazar.exams.results. */
export class OnlineExamResultsResponse {
  @ApiProperty({ type: ResultsExamResponse }) exam!: ResultsExamResponse;
  @ApiProperty({ type: [ResultsTalebeResponse] })
  talebe!: ResultsTalebeResponse[];
  @ApiProperty({ type: ResultsCountsResponse }) counts!: ResultsCountsResponse;
  @ApiProperty({ type: [ResultsTopicResponse] })
  topics!: ResultsTopicResponse[];
  @ApiProperty({ type: [ResultsQuestionResponse] })
  questions!: ResultsQuestionResponse[];
  @ApiProperty({ type: ResultsZerothResponse }) zeroth!: ResultsZerothResponse;
  @ApiProperty({
    description: "The results are released, by this page or by Değerlendirme.",
  })
  released!: boolean;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  releasedAt!: Date | null;
  @ApiProperty({
    description:
      "The caller holds `session.manage` on the course, which `releaseExamResults` asks.",
  })
  mayRelease!: boolean;
  @ApiProperty({
    description:
      "The celse has its Değerlendirme exam row, so its scores stand there and can be released.",
  })
  releasable!: boolean;
}

export class OnlineExamClosedResponse {
  @ApiProperty({ format: "uuid" }) examId!: string;
  @ApiProperty({ type: String, format: "date-time" }) closedEarlyAt!: Date;
  @ApiProperty({ description: "The attempts in progress the close finished." })
  finished!: number;
}

export class TalebeAnswerOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() correct!: boolean;
  @ApiProperty({ description: "The talebe chose it." }) chosen!: boolean;
}

export class TalebeAnswerQuestionResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty({
    description: "Its number in the exam's order, not the talebe's.",
  })
  number!: number;
  @ApiProperty() text!: string;
  @ApiProperty({ enum: AnswerMode, enumName: "AnswerMode" })
  answerMode!: AnswerMode;
  @ApiProperty({ enum: Scoring, enumName: "Scoring", nullable: true })
  scoring!: Scoring | null;
  @ApiProperty({ description: 'Its points, "2.00".' }) points!: string;
  @ApiProperty({
    description: 'The points this answer earned, two decimals, "1.00".',
  })
  earned!: string;
  @ApiProperty({ enum: AnswerVerdict, enumName: "AnswerVerdict" })
  verdict!: AnswerVerdict;
  @ApiProperty({ description: 'The talebe skipped it ("Soruyu atla").' })
  skipped!: boolean;
  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "When the answer was last saved; null when never answered.",
  })
  savedAt!: Date | null;
  @ApiProperty({ type: [TalebeAnswerOptionResponse] })
  options!: TalebeAnswerOptionResponse[];
}

export class TalebeAnswersZerothResponse {
  @ApiProperty() question!: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  optionId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "The text of the option the talebe chose.",
  })
  answer!: string | null;
}

export class TalebeAnswersExamResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
}

/** One talebe's answers on an online exam, question by question. */
export class TalebeAnswersResponse {
  @ApiProperty({ type: TalebeAnswersExamResponse })
  exam!: TalebeAnswersExamResponse;
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ enum: TalebeExamState, enumName: "TalebeExamState" })
  state!: TalebeExamState;
  @ApiProperty({ type: String, format: "date-time" }) startedAt!: Date;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: Date | null;
  @ApiProperty({ enum: FinishedBy, enumName: "FinishedBy", nullable: true })
  finishedBy!: FinishedBy | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Out of 100 with two decimals, "87.50"; null until finished.',
  })
  score!: string | null;
  @ApiProperty({ type: [ResultsSwitchResponse] })
  switches!: ResultsSwitchResponse[];
  @ApiProperty({ type: TalebeAnswersZerothResponse })
  zeroth!: TalebeAnswersZerothResponse;
  @ApiProperty({ type: [TalebeAnswerQuestionResponse] })
  questions!: TalebeAnswerQuestionResponse[];
}
