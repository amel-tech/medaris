import { AUTHZ_AUDIT, AUTHZ_CONTEXT, ROLE_RESOLVER } from "@medaris/common";
import { Global, Module } from "@nestjs/common";
import { BanModule } from "../ban/ban.module";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { FlashcardModule } from "../flashcard/flashcard.module";
import { KoskModule } from "../kosk/kosk.module";
import { MadrasahModule } from "../madrasah/madrasah.module";
import { TedrisatAuthzAudit } from "./tedrisat-authz-audit.service";
import { TedrisatAuthzContext } from "./tedrisat-authz-context.service";
import { TedrisatRoleResolver } from "./tedrisat-role-resolver.service";

/**
 * Binds the tedrisat-specific concretes to the tokens the global
 * `AuthzModule` consumes: the `RoleResolver` (what the caller is to the
 * resource: enrolled, author, …), the `AuthzContextLoader` (the scope chain,
 * policies and what the caller holds there) and the audit sink.
 *
 * Must be `@Global()` because `AuthzService` (which lives in the
 * `@Global` `AuthzModule` in `@medaris/common`) injects
 * `ROLE_RESOLVER` — and a non-global binding would not be visible to
 * a globally-registered provider's constructor at boot.
 *
 * The resolver reads enrollment and deck authorship through the feature
 * modules — `KoskService.exists`, `FlashcardDeckService.findVisibility`, and
 * `CourseRepository` for the course lookups no service exposes — so the
 * decision and the domain code share one code path over each table (review
 * findings on MDRS-41). The loader and the audit sink read and write through
 * `DatabaseService` alone: a loader that reached the feature modules back
 * would close a provider cycle.
 */
@Global()
@Module({
  imports: [
    DatabaseModule,
    KoskModule,
    MadrasahModule,
    CourseModule,
    FlashcardModule,
    BanModule,
  ],
  providers: [
    {
      provide: ROLE_RESOLVER,
      useClass: TedrisatRoleResolver,
    },
    { provide: AUTHZ_CONTEXT, useClass: TedrisatAuthzContext },
    { provide: AUTHZ_AUDIT, useClass: TedrisatAuthzAudit },
  ],
  exports: [ROLE_RESOLVER, AUTHZ_CONTEXT, AUTHZ_AUDIT],
})
export class AuthzBindingsModule {}
