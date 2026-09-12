import { Injectable, OnModuleInit, Type } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { AUTHZ_KEY } from "./authz.decorator";
import { AuthzGuard } from "./authz.guard";

/**
 * Refuses to boot an application that carries an `@Authz(...)` annotation
 * on a handler no `AuthzGuard` protects.
 *
 * `AuthzGuard` is route-scoped on purpose: it must run AFTER `AuthGuard`
 * has populated `request.user`, and a global `APP_GUARD` runs before any
 * controller-scoped guard, so registering it globally would break the one
 * ordering that makes it work. The price of route scoping is that
 * enforcement is opt-in twice — the decorator and the guard — and the two
 * failure modes are not symmetric: a guard without the decorator falls
 * through harmlessly, while a decorator without the guard reads as
 * protection in review and grants none. This assertion closes the second
 * case at startup, where it is loud, instead of at request time, where it
 * is silent.
 *
 * Both class-level and handler-level `@UseGuards` count, and a guard may be
 * registered as the class or as an instance. Routes without `@Authz` are
 * not inspected — the guard's own permissive fall-through for unannotated
 * routes is a separate, documented, transitional decision.
 */
@Injectable()
export class AuthzWiringAssertion implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector
  ) {}

  onModuleInit(): void {
    const unguarded = this.findUnguardedHandlers();
    if (unguarded.length === 0) return;
    throw new Error(
      `@Authz is annotated on ${unguarded.length} handler(s) that no AuthzGuard protects — ` +
        `the scope would never be checked: ${unguarded.join(", ")}. ` +
        "Add `@UseGuards(AuthGuard, AuthzGuard)` on the controller or the handler."
    );
  }

  /** `Controller.method` for every `@Authz` handler with no `AuthzGuard` in scope. */
  findUnguardedHandlers(): string[] {
    const offenders: string[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const controller = metatype as Type<unknown>;
      const prototype = Object.getPrototypeOf(instance) as Record<
        string,
        unknown
      >;
      const classGuards = this.guardsOn(controller);

      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[method];
        if (typeof handler !== "function") continue;
        if (!this.reflector.get(AUTHZ_KEY, handler)) continue;
        const guards = [...classGuards, ...this.guardsOn(handler)];
        if (!guards.some(isAuthzGuard)) {
          offenders.push(`${controller.name}.${method}`);
        }
      }
    }
    return offenders;
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
