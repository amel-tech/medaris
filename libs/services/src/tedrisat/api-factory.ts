import {
  ArchiveApi,
  BansApi,
  Configuration,
  CoursesApi,
  EvaluationsApi,
  ExamsApi,
  FlashcardCardsApi,
  FlashcardDeckLabelApi,
  FlashcardDecksApi,
  FlashcardlabelApi,
  KoskApplicationsApi,
  KosksApi,
  LessonAssignmentsApi,
  LessonsApi,
  MadrasahsApi,
  MeApi,
  MyExamsApi,
  NizamApi,
  NotificationsApi,
  OnlineExamAttemptsApi,
  OnlineExamsApi,
  PracticeApi,
  QuestionNotesApi,
  ResourcesApi,
  SessionsApi,
  SubmissionsApi,
  TedrisatServiceApi,
  UsersApi,
} from "./generated/src";

// Re-export types that are used in other apps
export type {
  AnswerLessonQuestionDto,
  AnswerMode,
  AppointMedarisNazimDto,
  ArchiveImpactResponse,
  ArchiveItemResponse,
  ArchiveItemType,
  ArchiveRestoreResponse,
  ArchiverResponse,
  ArchiveScopesResponse,
  AskLessonQuestionDto,
  AssignmentKind,
  AssignmentResponse,
  AttemptAnswerResponse,
  AttemptOptionResponse,
  AttemptQuestionResponse,
  AttemptStatus,
  BanListResponse,
  BanPersonResponse,
  BanReasonDto,
  BanResponse,
  BanScope,
  BriefingAttemptResponse,
  BriefingZerothOptionResponse,
  BriefingZerothResponse,
  CatalogSectionResponse,
  ChiefNazimResponse,
  CourseDetailResponse,
  CourseQuestionResponse,
  CourseResourceFileUploadResponse,
  CourseSarfRootResponse,
  CourseSubmissionResponse,
  CourseSubmissionSessionResponse,
  CourseSubmissionsResponse,
  CourseSummaryResponse,
  CourseTermResponse,
  CourseTopicResponse,
  CreateCourseDto,
  CreateCourseTermDto,
  CreateFlashcardDeckDto,
  CreateFlashcardDeckLabelDto,
  CreateFlashcardDeckLabelingDto,
  CreateFlashcardDto,
  CreateFlashcardLabelDto,
  CreateFlashcardLabelingDto,
  CreateKoskApplicationDto,
  CreateKoskDto,
  CreateLessonDto,
  CreateLessonNoteDto,
  CreateMadrasahBanDto,
  CreateMuderrisDto,
  CreateOffsiteCourseRequestDto,
  CreatePermissionGroupDto,
  CreateResourceDto,
  CreateWeekDto,
  CreateWeekLessonDto,
  DashboardApplicationResponse,
  DashboardSessionResponse,
  DeckLabelStatsResponse,
  DeletePermissionGroupDto,
  DismissAction,
  DismissDecisionDto,
  DismissMadrasahNazirDecisionDto,
  DismissMadrasahNazirDto,
  DismissMedarisNazimDto,
  DraftCourseTopicResponse,
  EffectivePermissionGroup,
  EnrolledCourseResponse,
  EnrollmentBanResponse,
  EnrollmentResponse,
  EvaluationBoardResponse,
  EvaluationColumnKind,
  EvaluationColumnResponse,
  EvaluationMarkResponse,
  EvaluationStatus,
  EvaluationTalebeResponse,
  ExamAnswerSavedResponse,
  ExamAttemptResponse,
  ExamBriefingResponse,
  ExamClockResponse,
  ExamKind,
  ExamOptionResponse,
  ExamQuestionNoteResponse,
  ExamQuestionResponse,
  ExamQuestionWriteResponse,
  ExamWindow,
  FinishedBy,
  FlashcardCreateLabelResponse,
  FlashcardDeckCreateLabelResponse,
  FlashcardDeckExploreResponse,
  FlashcardDeckLabelingResponse,
  FlashcardDeckLabelResponse,
  FlashcardDeckResponse,
  FlashcardDeckSummaryResponse,
  FlashcardLabelingResponse,
  FlashcardLabelResponse,
  FlashcardProgressResponse,
  FlashcardResponse,
  FlashcardStudyRoundResponse,
  FollowedKoskCourseResponse,
  GivenItemResponse,
  GivenKind,
  GrantResponse,
  GroupUserResponse,
  HostingCoursesAction,
  HostingOpenCourseResponse,
  HostingRightResponse,
  KoskApplicationResponse,
  KoskResponse,
  LabelStatsResponse,
  LessonAssignmentFileResponse,
  LessonAssignmentResponse,
  LessonBoardFileResponse,
  LessonBoardResponse,
  LessonMutationResponse,
  LessonNoteResponse,
  LessonQuestionResponse,
  LessonResourceFileUploadResponse,
  LessonResourceResponse,
  LessonResponse,
  LessonSubmissionResponse,
  LessonTeacherNoteResponse,
  MadrasahBanListResponse,
  MadrasahBanResponse,
  MadrasahCourseKoskResponse,
  MadrasahCourseListItemResponse,
  MadrasahCourseListMuderrisResponse,
  MadrasahDashboardResponse,
  MadrasahDirectoryItemResponse,
  MadrasahDirectoryResponse,
  MadrasahNazirGivenResponse,
  MadrasahNazirGivenRoleResponse,
  MadrasahNazirGroupResponse,
  MadrasahNazirResponse,
  MadrasahPoliciesResponse,
  MadrasahResponse,
  MadrasahSettingsResponse,
  MadrasahStatus,
  MadrasahStatusFilter,
  MadrasahStudentCourseResponse,
  MadrasahStudentResponse,
  MadrasahStudentsResponse,
  MadrasahZerothQuestionResponse,
  MedarisNazimResponse,
  MeResponse,
  MuderrisResponse,
  MyAnsweredOptionResponse,
  MyAnsweredQuestionResponse,
  MyAssignmentsResponse,
  MyCourseTopicStandingResponse,
  MyEffectivePermissionsResponse,
  MyExamCountsResponse,
  MyExamFormat,
  MyExamResponse,
  MyExamResultResponse,
  MyExamState,
  MyGrantsResponse,
  MyPermissionsResponse,
  MyPublicProfileResponse,
  MyQuestionNoteListItemResponse,
  MyQuestionNoteResponse,
  MyRolesResponse,
  MySubmissionSummaryResponse,
  MySubmissionsResponse,
  MyTopicStandingResponse,
  NazimGroupResponse,
  NazimPermissionResponse,
  NazimPersonResponse,
  NotificationCountsResponse,
  NotificationResponse,
  OffsiteCourseRequestResponse,
  OnlineExamDraftResponse,
  OnlineExamSummaryResponse,
  OpenMadrasahCourseDto,
  OwnEvaluationResponse,
  OwnSubmissionResponse,
  PaginatedArchiveResponse,
  PaginatedKoskResponse,
  PaginatedMadrasahResponse,
  PaginatedNotificationResponse,
  PendingEnrollmentResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
  PermissionGroupScope,
  PracticeAnswerSavedResponse,
  PracticeAttemptResponse,
  PracticeAttemptStatus,
  PracticeAttemptSummaryResponse,
  PracticeOptionResponse,
  PracticeOutcome,
  PracticeQuestionResponse,
  PracticeResultResponse,
  PracticeSetSummaryResponse,
  ProfileVisibility,
  PublicProfileResponse,
  QuestionAnswerResponse,
  QuestionNoteTalebeResponse,
  QuestionOutcome,
  QuestionPersonResponse,
  QuestionTalebeNotesResponse,
  ReadAllNotificationsResponse,
  RemoveEnrollmentDto,
  ReplaceCourseDto,
  ReplyQuestionNoteDto,
  ResourceFileResponse,
  ResourceResponse,
  RosterEnrollmentResponse,
  SaveCourseSarfRootDto,
  SaveEvaluationDto,
  SaveExamQuestionDto,
  SaveLessonAssignmentDto,
  SaveLessonTeacherNoteDto,
  SaveMyQuestionNoteDto,
  SaveSubmissionNoteDto,
  ScheduleSessionResponse,
  Scoring,
  SendSubmissionReviewDto,
  SetEnrollmentStatusDto,
  SetMadrasahCourseMuderrisDto,
  SetNazimGrantsDto,
  SetTalebeNotesDto,
  SubmissionFileResponse,
  SubmissionReviewerResponse,
  SubmissionReviewResponse,
  SubmissionTalebeResponse,
  UpdateCourseDto,
  UpdateCourseTermDto,
  UpdateFlashcardDeckDto,
  UpdateFlashcardDto,
  UpdateKoskDto,
  UpdateLessonDto,
  UpdateLessonNoteDto,
  UpdateMadrasahSettingsDto,
  UpdateMeDto,
  UpdatePermissionGroupDto,
  UpdateProfileVisibilityDto,
  UpdateProgressDto,
  UpdatePublicProfileDto,
  UserSummaryResponse,
  UsersPolicy,
  WeekResponse,
} from "./generated/src";

import {
  CreateCourseDtoLevelEnum,
  CreateCourseDtoStatusEnum,
} from "./generated/src/models/CreateCourseDto";
import { CreateFlashcardDtoTypeEnum } from "./generated/src/models/CreateFlashcardDto";
import { CreateLessonDtoTypeEnum } from "./generated/src/models/CreateLessonDto";
import { DeckCollectionKind } from "./generated/src/models/DeckCollectionKind";
import { DeckPublishStatus } from "./generated/src/models/DeckPublishStatus";
import { DeckSource } from "./generated/src/models/DeckSource";
import { EnrollmentResponseStatusEnum } from "./generated/src/models/EnrollmentResponse";
// Re-export enum constants (they are used at runtime as values)
import { FlashcardResponseTypeEnum } from "./generated/src/models/FlashcardResponse";
import { FlashcardType } from "./generated/src/models/FlashcardType";
import { ReviewRating } from "./generated/src/models/ReviewRating";
import { TeamSettableEnrollmentStatus } from "./generated/src/models/TeamSettableEnrollmentStatus";

export {
  DeckCollectionKind,
  DeckPublishStatus,
  DeckSource,
  FlashcardType,
  ReviewRating,
  FlashcardResponseTypeEnum,
  CreateFlashcardDtoTypeEnum,
  CreateLessonDtoTypeEnum,
  CreateCourseDtoLevelEnum,
  CreateCourseDtoStatusEnum,
  EnrollmentResponseStatusEnum,
  TeamSettableEnrollmentStatus,
};

export interface TedrisatAPIConfig {
  baseUrl: string;
  token?: string;
}

/**
 * Factory to create authenticated Tedrisat API clients
 * Direct usage of generated OpenAPI clients
 */
export function createTedrisatAPIs(config: TedrisatAPIConfig) {
  const configuration = new Configuration({
    basePath: config.baseUrl,
    headers: config.token
      ? {
          Authorization: `Bearer ${config.token}`,
        }
      : undefined,
  });

  return {
    decks: new FlashcardDecksApi(configuration),
    cards: new FlashcardCardsApi(configuration),
    service: new TedrisatServiceApi(configuration),
    kosks: new KosksApi(configuration),
    // "Köşk açma başvurusu" (MDRS-166).
    koskApplications: new KoskApplicationsApi(configuration),
    // The medrese layer (MDRS-106); tedris' medrese page reads it (MDRS-122).
    madrasahs: new MadrasahsApi(configuration),
    courses: new CoursesApi(configuration),
    // Session-level lesson writes (MDRS-95).
    lessons: new LessonsApi(configuration),
    // The caller's own profile and settings (MDRS-104); the web apps read
    // `timeZone` from it to pick the zone dates are shown in (MDRS-110).
    me: new MeApi(configuration),
    // Exact e-mail lookup (MDRS-104) — nizam's müderris picker (MDRS-105).
    users: new UsersApi(configuration),
    // Who the Medaris başnazımı is, for the 'no access' screen (MDRS-169).
    nizam: new NizamApi(configuration),
    // The caller's in-app notifications (MDRS-167): the list page and the bell.
    notifications: new NotificationsApi(configuration),
    // The caller's own schedule: Programım and the phone menu's next session (MDRS-163).
    sessions: new SessionsApi(configuration),
    // Hidden things, brought back or deleted for real (MDRS-173).
    archive: new ArchiveApi(configuration),
    // Barring a talebe and lifting it (MDRS-177).
    bans: new BansApi(configuration),
    // A course's and a celse's resource files: upload and download through
    // tedrisat, never from storage directly (MDRS-287).
    resources: new ResourcesApi(configuration),
    // A talebe's homework on a celse, and the course staff's read of it
    // under `submission.read` (MDRS-290).
    submissions: new SubmissionsApi(configuration),
    // The homework the course team sets on a celse, apart from its
    // resources: its description and its own files (`session.manage`).
    lessonAssignments: new LessonAssignmentsApi(configuration),
    // "Değerlendirme": marks on memorisation homework (MDRS-248)
    evaluations: new EvaluationsApi(configuration),
    exams: new ExamsApi(configuration),
    // Preparing online multiple-choice exams (MDRS-299): the course's
    // numbered topics, the drafts and their questions (`exam.prepare`).
    onlineExams: new OnlineExamsApi(configuration),
    // A talebe's sitting of a published online exam (MDRS-299), by its celse.
    onlineExamAttempts: new OnlineExamAttemptsApi(configuration),
    // A talebe's own exams (MDRS-299): Sınavlarım and the screen of a past one.
    myExams: new MyExamsApi(configuration),
    // A talebe's çalışma soruları (MDRS-248): the published çalışma setleri of
    // their courses and their attempts at them.
    practice: new PracticeApi(configuration),
    // Soru notları (MDRS-248): a talebe's note on a question, kept or sent to
    // the hoca, and the hoca's list and answer.
    questionNotes: new QuestionNotesApi(configuration),
    // The two label controllers MDRS-58 published for the first time. Generated
    // classes that only `./generated/src` exported were reachable by no app —
    // this factory is what `@medaris/services/tedrisat` hands out.
    labels: new FlashcardlabelApi(configuration),
    deckLabels: new FlashcardDeckLabelApi(configuration),
  };
}

/**
 * Convenience function for server-side usage with token
 */
export async function createServerTedrisatAPIs(
  token: string | undefined,
  baseUrl: string
) {
  return createTedrisatAPIs({ baseUrl, token });
}
