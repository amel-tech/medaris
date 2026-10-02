import {
  ArchiveApi,
  BansApi,
  Configuration,
  CoursesApi,
  FlashcardCardsApi,
  FlashcardDeckLabelApi,
  FlashcardDecksApi,
  FlashcardlabelApi,
  KosksApi,
  LessonsApi,
  MadrasahsApi,
  MeApi,
  NizamApi,
  NotificationsApi,
  SessionsApi,
  TedrisatServiceApi,
  UsersApi,
} from "./generated/src";

// Re-export types that are used in other apps
export type {
  AppointMedarisNazimDto,
  ArchiveImpactResponse,
  ArchiveItemResponse,
  ArchiveItemType,
  ArchiveRestoreResponse,
  ArchiverResponse,
  ArchiveScopesResponse,
  AssignmentResponse,
  BanListResponse,
  BanPersonResponse,
  BanResponse,
  BanScope,
  CatalogSectionResponse,
  ChiefNazimResponse,
  CourseDetailResponse,
  CourseSummaryResponse,
  CreateCourseDto,
  CreateFlashcardDeckDto,
  CreateFlashcardDeckLabelDto,
  CreateFlashcardDeckLabelingDto,
  CreateFlashcardDto,
  CreateFlashcardLabelDto,
  CreateFlashcardLabelingDto,
  CreateKoskDto,
  CreateLessonDto,
  CreateMuderrisDto,
  CreatePermissionGroupDto,
  CreateResourceDto,
  CreateWeekDto,
  CreateWeekLessonDto,
  DeckLabelStatsResponse,
  DeletePermissionGroupDto,
  DismissAction,
  DismissDecisionDto,
  DismissMedarisNazimDto,
  EffectivePermissionGroup,
  EnrolledCourseResponse,
  EnrollmentBanResponse,
  EnrollmentResponse,
  FlashcardCreateLabelResponse,
  FlashcardDeckCreateLabelResponse,
  FlashcardDeckLabelingResponse,
  FlashcardDeckLabelResponse,
  FlashcardDeckResponse,
  FlashcardLabelingResponse,
  FlashcardLabelResponse,
  FlashcardResponse,
  GivenItemResponse,
  GivenKind,
  GrantResponse,
  GroupUserResponse,
  HostingCoursesAction,
  HostingOpenCourseResponse,
  HostingRightResponse,
  KoskResponse,
  LabelStatsResponse,
  LessonMutationResponse,
  LessonResponse,
  MadrasahDirectoryItemResponse,
  MadrasahDirectoryResponse,
  MadrasahResponse,
  MadrasahStatus,
  MadrasahStatusFilter,
  MedarisNazimResponse,
  MeResponse,
  MuderrisResponse,
  MyAssignmentsResponse,
  MyEffectivePermissionsResponse,
  MyGrantsResponse,
  MyPermissionsResponse,
  MyRolesResponse,
  NazimGroupResponse,
  NazimPermissionResponse,
  NazimPersonResponse,
  NotificationCountsResponse,
  NotificationResponse,
  PaginatedArchiveResponse,
  PaginatedKoskResponse,
  PaginatedMadrasahResponse,
  PaginatedNotificationResponse,
  PendingEnrollmentResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
  PermissionGroupScope,
  ReadAllNotificationsResponse,
  RemoveEnrollmentDto,
  ReplaceCourseDto,
  ResourceResponse,
  RosterEnrollmentResponse,
  ScheduleSessionResponse,
  SetEnrollmentStatusDto,
  SetNazimGrantsDto,
  UpdateCourseDto,
  UpdateFlashcardDeckDto,
  UpdateFlashcardDto,
  UpdateKoskDto,
  UpdateLessonDto,
  UpdatePermissionGroupDto,
  UpdateProgressDto,
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
import { EnrollmentResponseStatusEnum } from "./generated/src/models/EnrollmentResponse";
// Re-export enum constants (they are used at runtime as values)
import { FlashcardResponseTypeEnum } from "./generated/src/models/FlashcardResponse";
import { TeamSettableEnrollmentStatus } from "./generated/src/models/TeamSettableEnrollmentStatus";

export {
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
