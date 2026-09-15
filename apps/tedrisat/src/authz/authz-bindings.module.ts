import { ROLE_RESOLVER } from "@medaris/common";
import { Global, Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { FlashcardModule } from "../flashcard/flashcard.module";
import { KoskModule } from "../kosk/kosk.module";
import { TedrisatRoleResolver } from "./tedrisat-role-resolver.service";

/**
 * Binds the tedrisat-specific concrete `RoleResolver` to the
 * `ROLE_RESOLVER` token consumed by the global `AuthzModule`.
 *
 * Must be `@Global()` because `AuthzService` (which lives in the
 * `@Global` `AuthzModule` in `@medaris/common`) injects
 * `ROLE_RESOLVER` — and a non-global binding would not be visible to
 * a globally-registered provider's constructor at boot.
 *
 * The resolver reads ownership, membership and enrollment through the
 * feature modules — `KoskService.isOwner`, `FlashcardDeckService.findById`,
 * and `CourseRepository` for the course lookups no service exposes — rather
 * than through `DatabaseService` directly, so the authorization decision and
 * the domain code share one code path over each table (review findings on
 * MDRS-41). The three modules export exactly what this needs.
 */
@Global()
@Module({
  imports: [KoskModule, CourseModule, FlashcardModule],
  providers: [
    {
      provide: ROLE_RESOLVER,
      useClass: TedrisatRoleResolver,
    },
  ],
  exports: [ROLE_RESOLVER],
})
export class AuthzBindingsModule {}
