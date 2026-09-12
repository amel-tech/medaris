import { Controller, Get, UseGuards } from "@nestjs/common";
import { MetadataScanner, Reflector } from "@nestjs/core";
import {
  Authz,
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

  @Get()
  list(): void {}
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

const discoveryFor = (...controllers: (new () => unknown)[]) =>
  ({
    getControllers: () =>
      controllers.map((metatype) => ({ metatype, instance: new metatype() })),
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

  it("boots when every @Authz handler is guarded", () => {
    const assertion = assertionFor(
      GuardedOnClassController,
      GuardedOnHandlerController,
      PlainController
    );
    expect(() => assertion.onModuleInit()).not.toThrow();
  });
});
