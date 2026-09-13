import { Injectable, OnModuleInit, Type } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { AUTHZ_EXEMPT_KEY, AUTHZ_KEY } from "./authz.decorator";
import { AuthzGuard } from "./authz.guard";

/**
 * Refuses to boot an application whose `@Authz` wiring is only half done.
 *
 * `AuthzGuard` is route-scoped on purpose: it must run AFTER `AuthGuard`
 * has populated `request.user`, and a global `APP_GUARD` runs before any
 * controller-scoped guard, so registering it globally would break the one
 * ordering that makes it work. The price of route scoping is that
 * enforcement is opt-in twice — the decorator and the guard — and each half
 * can be forgotten:
 *
 *  1. `@Authz` on a handler with no `AuthzGuard` in scope: the scope is
 *     never checked, while the annotation reads as protection in review.
 *  2. `AuthzGuard` on a controller (the usual class-level `@UseGuards`)
 *     with a handler that carries no `@Authz`: that handler is
 *     authenticated-only while the class reads as authorized — the
 *     horizontal-escalation shape, an `:id` route with no ownership check.
 *     `@Authz` is per method by design, so this is one forgotten line away
 *     on every controller that adopts the guard.
 *
 * Both directions fail here, at startup, where they are loud, instead of at
 * request time, where they are silent. A handler that genuinely needs no
 * scope on a guarded controller says so with `@AuthzExempt()`. Controllers
 * without `AuthzGuard` are not inspected in the second direction — the
 * guard's permissive fall-through for them is a separate, documented,
 * transitional decision.
 *
 * Metadata is read off `metatype.prototype`, not off an instance, so
 * request- and transient-scoped controllers — which have no instance at
 * boot — are inspected like every other one rather than skipped.
 */
@Injectable()
export class AuthzWiringAssertion implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector
  ) {}

  onModuleInit(): void {
    const { unguarded, unannotated } = this.inspect();
    const problems: string[] = [];
    if (unguarded.length > 0) {
      problems.push(
        `@Authz is annotated on ${unguarded.length} handler(s) that no AuthzGuard protects — ` +
          `the scope would never be checked: ${unguarded.join(", ")}. ` +
          "Add `@UseGuards(AuthGuard, AuthzGuard)` on the controller or the handler."
      );
    }
    if (unannotated.length > 0) {
      problems.push(
        `${unannotated.length} route handler(s) sit behind AuthzGuard with neither @Authz nor ` +
          `@AuthzExempt(): ${unannotated.join(", ")}. ` +
          "They are authenticated-only while the controller reads as authorized. " +
          "Give each a scope, or mark it `@AuthzExempt()` to say the omission is deliberate."
      );
    }
    if (problems.length > 0) {
      throw new Error(problems.join("\n"));
    }
  }

  /** `Controller.method` for every `@Authz` handler with no `AuthzGuard` in scope. */
  findUnguardedHandlers(): string[] {
    return this.inspect().unguarded;
  }

  /** `Controller.method` for every route handler behind `AuthzGuard` that carries neither `@Authz` nor `@AuthzExempt()`. */
  findUnannotatedHandlers(): string[] {
    return this.inspect().unannotated;
  }

  private inspect(): { unguarded: string[]; unannotated: string[] } {
    const unguarded: string[] = [];
    const unannotated: string[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const controller = wrapper.metatype as Type<unknown> | null | undefined;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      const classGuards = this.guardsOn(controller);
      const guardedAtClass = classGuards.some(isAuthzGuard);

      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[method];
        if (typeof handler !== "function") continue;
        const annotated = this.reflector.get(AUTHZ_KEY, handler) !== undefined;
        const exempt =
          this.reflector.get(AUTHZ_EXEMPT_KEY, handler) !== undefined;
        const guarded =
          guardedAtClass || this.guardsOn(handler).some(isAuthzGuard);

        if (annotated && !guarded) {
          unguarded.push(`${controller.name}.${method}`);
        }
        // Only route handlers count in the second direction — helpers on the
        // controller are not reachable over HTTP.
        if (
          !annotated &&
          !exempt &&
          guarded &&
          Reflect.getMetadata(PATH_METADATA, handler) !== undefined
        ) {
          unannotated.push(`${controller.name}.${method}`);
        }
      }
    }
    return { unguarded, unannotated };
  }

  private guardsOn(target: object): unknown[] {
    // `Reflect.getMetadata` rather than `Reflector.get`: the latter is typed
    // for `Type | Function` targets and decorator-typed keys, and this reads a
    // plain string key off both a class and a prototype method.
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
    return Array.isArray(guards) ? guards : [];
  }
}

function isAuthzGuard(guard: unknown): boolean {
  return guard === AuthzGuard || guard instanceof AuthzGuard;
}
