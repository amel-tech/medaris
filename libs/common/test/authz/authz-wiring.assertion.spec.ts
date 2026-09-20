import { Controller, Get, UseGuards } from "@nestjs/common";
import { MetadataScanner, Reflector } from "@nestjs/core";
import {
  Authz,
  AuthzExempt,
  AuthzGuard,
  AuthzWiringAssertion,
  byParam,
  ENTITIES,
  SCOPES,
} from "../../src";

/**
 * A stand-in for the real `AuthGuard`, which lives in this library too but
 * needs Keycloak configuration to construct. Any guard class does here —
 * the assertion only looks for `AuthzGuard`.
 */
class SomeOtherGuard {
  canActivate(): boolean {
    return true;
  }
}

@Controller("guarded-on-class")
@UseGuards(SomeOtherGuard, AuthzGuard)
class GuardedOnClassController {
  @Get(":id")
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK))
  read(): void {}
}

@Controller("guarded-on-handler")
class GuardedOnHandlerController {
  @Get(":id")
  @UseGuards(SomeOtherGuard, AuthzGuard)
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK))
  read(): void {}

  // Not behind AuthzGuard — the guard is on `read` only — so no annotation
  // is expected here.
  @Get()
  list(): void {}
}

@Controller("guarded-on-class-with-a-forgotten-handler")
@UseGuards(SomeOtherGuard, AuthzGuard)
class PartiallyAnnotatedController {
  @Get(":id")
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK))
  read(): void {}

  // The forgotten line: behind the class-level guard, no scope, no opt-out.
  @Get()
  list(): void {}

  // Not a route — a helper on the controller — so it is not counted.
  helper(): void {}
}

@Controller("guarded-on-class-with-an-exempt-handler")
@UseGuards(SomeOtherGuard, AuthzGuard)
class ExemptController {
  @Get(":id")
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK))
  read(): void {}

  @Get("health")
  @AuthzExempt()
  health(): void {}
}

@Controller("annotated-but-unguarded")
@UseGuards(SomeOtherGuard)
class UnguardedController {
  @Get(":id")
  @Authz(SCOPES.EDIT, byParam(ENTITIES.KOSK))
  update(): void {}

  @Get()
  list(): void {}
}

@Controller("no-authz-at-all")
class PlainController {
  @Get()
  list(): void {}
}

// No `instance`: a request- or transient-scoped controller has none at boot,
// and the assertion must inspect it all the same.
const discoveryFor = (...controllers: (new () => unknown)[]) =>
  ({
    getControllers: () =>
      controllers.map((metatype) => ({ metatype, instance: null })),
  }) as unknown as ConstructorParameters<typeof AuthzWiringAssertion>[0];

const assertionFor = (...controllers: (new () => unknown)[]) =>
  new AuthzWiringAssertion(
    discoveryFor(...controllers),
    new MetadataScanner(),
    new Reflector()
  );

describe("AuthzWiringAssertion", () => {
  it("accepts an @Authz handler whose controller carries AuthzGuard", () => {
    expect(
      assertionFor(GuardedOnClassController).findUnguardedHandlers()
    ).toEqual([]);
  });

  it("accepts an @Authz handler that carries AuthzGuard itself", () => {
    expect(
      assertionFor(GuardedOnHandlerController).findUnguardedHandlers()
    ).toEqual([]);
  });

  it("ignores controllers and handlers with no @Authz", () => {
    expect(assertionFor(PlainController).findUnguardedHandlers()).toEqual([]);
  });

  it("names an @Authz handler that no AuthzGuard protects", () => {
    expect(assertionFor(UnguardedController).findUnguardedHandlers()).toEqual([
      "UnguardedController.update",
    ]);
  });

  it("refuses to boot on the unguarded handler, naming it and the fix", () => {
    const assertion = assertionFor(
      GuardedOnClassController,
      UnguardedController
    );
    expect(() => assertion.onModuleInit()).toThrow(
      /UnguardedController\.update.*@UseGuards\(AuthGuard, AuthzGuard\)/
    );
  });

  it("names a route behind a class-level AuthzGuard that carries neither @Authz nor @AuthzExempt", () => {
    const assertion = assertionFor(PartiallyAnnotatedController);
    expect(assertion.findUnannotatedHandlers()).toEqual([
      "PartiallyAnnotatedController.list",
    ]);
    expect(() => assertion.onModuleInit()).toThrow(
      /PartiallyAnnotatedController\.list.*@AuthzExempt\(\)/
    );
  });

  it("accepts an unannotated route behind the guard when it is marked @AuthzExempt()", () => {
    const assertion = assertionFor(ExemptController);
    expect(assertion.findUnannotatedHandlers()).toEqual([]);
    expect(() => assertion.onModuleInit()).not.toThrow();
  });

  it("does not demand annotations on a controller without AuthzGuard", () => {
    expect(
      assertionFor(
        GuardedOnHandlerController,
        PlainController
      ).findUnannotatedHandlers()
    ).toEqual([]);
  });

  it("boots when every @Authz handler is guarded", () => {
    const assertion = assertionFor(
      GuardedOnClassController,
      GuardedOnHandlerController,
      ExemptController,
      PlainController
    );
    expect(() => assertion.onModuleInit()).not.toThrow();
  });
});
