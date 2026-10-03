import { ExecutionContext, NotFoundException } from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import {
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  AuthzForbiddenError,
  AuthzGuard,
  AuthzMeta,
  AuthzMissingUserError,
  AuthzResolverError,
  AuthzService,
  ENTITIES,
  ROLES,
  RoleResolver,
  SCOPES,
} from "../../src";

const buildContext = (
  request: Record<string, unknown>
): { ctx: ExecutionContext; handler: () => void } => {
  const handler = function handler() {};
  const ctx = {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, handler };
};

// Keyed on purpose: the guard reads two keys off the same handler, and a fake
// that answered `meta` for both would mark every handler `@AuthzPublic()`.
const reflectorReturning = (meta?: AuthzMeta, isPublic = false): Reflector =>
  ({
    get: (key: string) => {
      if (key === AUTHZ_KEY) return meta;
      if (key === AUTHZ_PUBLIC_KEY && isPublic) return true;
      return undefined;
    },
  }) as unknown as Reflector;

const fakeRoleResolver = (
  role: ReturnType<RoleResolver["resolve"]>,
  anonymousRole?: typeof ROLES.ANONYMOUS | null
): RoleResolver => ({
  resolve: vi.fn().mockResolvedValue(role),
  ...(anonymousRole !== undefined && {
    resolveAnonymous: vi.fn().mockResolvedValue(anonymousRole),
  }),
});

const publicDeckMeta: AuthzMeta = {
  scope: SCOPES.VIEW,
  resolve: () => ({ entity: ENTITIES.FLASHCARD_DECK, id: "d-1" }),
};

const moduleRefStub = {} as ModuleRef;

describe("AuthzGuard", () => {
  it("passes through when no @Authz metadata is present", async () => {
    const guard = new AuthzGuard(
      reflectorReturning(),
      new AuthzService(fakeRoleResolver(null)),
      moduleRefStub
    );
    const { ctx } = buildContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("throws AuthzMissingUserError when metadata is set but user is absent", async () => {
    const meta: AuthzMeta = {
      scope: SCOPES.EDIT,
      resolve: () => ({ entity: ENTITIES.COURSE, id: "c-1" }),
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(null)),
      moduleRefStub
    );
    const { ctx } = buildContext({ params: { id: "c-1" } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      AuthzMissingUserError
    );
  });

  it("allows when AuthzService.can resolves true", async () => {
    const meta: AuthzMeta = {
      scope: SCOPES.EDIT,
      resolve: () => ({ entity: ENTITIES.COURSE, id: "c-1" }),
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(ROLES.MUDERRIS)),
      moduleRefStub
    );
    const { ctx } = buildContext({ user: { sub: "u-1" } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("throws AuthzForbiddenError with structured context when denied", async () => {
    const meta: AuthzMeta = {
      scope: SCOPES.ASSIGN_MUDERRIS,
      resolve: () => ({ entity: ENTITIES.COURSE, id: "c-1" }),
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(ROLES.MUDERRIS)),
      moduleRefStub
    );
    const { ctx } = buildContext({ user: { sub: "u-1" } });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      name: "AuthzForbiddenError",
      context: {
        userId: "u-1",
        entity: "course",
        resourceId: "c-1",
        scope: "assign_muderris",
      },
    });
  });

  it("awaits async resolvers and passes ModuleRef into them", async () => {
    const fakeMod = { tag: "mod-stub" } as unknown as ModuleRef;
    let observedMod: unknown;
    const meta: AuthzMeta = {
      scope: SCOPES.VIEW,
      resolve: async (_req, mod) => {
        observedMod = mod;
        return { entity: ENTITIES.FLASHCARD_DECK, id: "d-1" };
      },
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(ROLES.PUBLIC)), // explicit PUBLIC for view ✓ on flashcard-deck
      fakeMod
    );
    const { ctx } = buildContext({ user: { sub: "u-1" } });
    await guard.canActivate(ctx);
    expect(observedMod).toBe(fakeMod);
  });

  describe("resolver failure modes", () => {
    it("wraps unknown errors in AuthzResolverError (500)", async () => {
      const meta: AuthzMeta = {
        scope: SCOPES.VIEW,
        resolve: () => {
          throw new Error("boom");
        },
      };
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(fakeRoleResolver(null)),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        AuthzResolverError
      );
    });

    it("keeps what the resolver threw out of the message and context, carrying it as cause (MDRS-220)", async () => {
      const thrown = new Error(
        'Failed query: select "id" from "madrasahs" where "id" = $1'
      );
      const meta: AuthzMeta = {
        scope: SCOPES.VIEW,
        resolve: () => {
          throw thrown;
        },
      };
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(fakeRoleResolver(null)),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });

      const error = await guard.canActivate(ctx).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AuthzResolverError);
      const { message, context, cause } = error as AuthzResolverError;
      const serialised = JSON.stringify({ message, context });
      expect(serialised).not.toContain("madrasahs");
      expect(serialised).not.toContain("select");
      expect(context).toEqual({ scope: SCOPES.VIEW });
      expect(cause).toBe(thrown);
    });

    it("lets HttpException propagate (so 404 stays 404)", async () => {
      const meta: AuthzMeta = {
        scope: SCOPES.VIEW,
        resolve: () => {
          throw new NotFoundException("missing");
        },
      };
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(fakeRoleResolver(null)),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("rejects empty resource IDs as a configuration error", async () => {
      const meta: AuthzMeta = {
        scope: SCOPES.VIEW,
        resolve: () => ({ entity: ENTITIES.COURSE, id: "" }),
      };
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(fakeRoleResolver(null)),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        AuthzResolverError
      );
    });
  });

  describe("@AuthzPublic — a caller with no token (MDRS-45)", () => {
    it("lets an anonymous caller through a public handler that carries no @Authz", async () => {
      const guard = new AuthzGuard(
        reflectorReturning(undefined, true),
        new AuthzService(fakeRoleResolver(null)),
        moduleRefStub
      );
      const { ctx } = buildContext({});
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it("allows an anonymous caller when the resolver answers ANONYMOUS and the row lists the scope", async () => {
      const resolver = fakeRoleResolver(null, ROLES.ANONYMOUS);
      const guard = new AuthzGuard(
        reflectorReturning(publicDeckMeta, true),
        new AuthzService(resolver),
        moduleRefStub
      );
      const { ctx } = buildContext({ params: { id: "d-1" } });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      // The authenticated path was never taken: there is no `sub` to resolve.
      expect(resolver.resolve).not.toHaveBeenCalled();
    });

    it("refuses an anonymous caller with 401, not 403, when the resolver says no", async () => {
      const guard = new AuthzGuard(
        reflectorReturning(publicDeckMeta, true),
        new AuthzService(fakeRoleResolver(null, null)),
        moduleRefStub
      );
      const { ctx } = buildContext({ params: { id: "d-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        AuthzMissingUserError
      );
    });

    it("refuses an anonymous caller with 401 when the ANONYMOUS row does not list the scope", async () => {
      const guard = new AuthzGuard(
        reflectorReturning(
          { ...publicDeckMeta, scope: SCOPES.MANAGE_PRIVATE_DECK },
          true
        ),
        new AuthzService(fakeRoleResolver(null, ROLES.ANONYMOUS)),
        moduleRefStub
      );
      const { ctx } = buildContext({ params: { id: "d-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        AuthzMissingUserError
      );
    });

    it("lets a resolver's 404 through for an anonymous caller, so private reads as absent", async () => {
      const guard = new AuthzGuard(
        reflectorReturning(
          {
            scope: SCOPES.VIEW,
            resolve: () => {
              throw new NotFoundException("missing");
            },
          },
          true
        ),
        new AuthzService(fakeRoleResolver(null, ROLES.ANONYMOUS)),
        moduleRefStub
      );
      const { ctx } = buildContext({});
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("decides an authenticated caller on a public handler exactly as without the marker", async () => {
      const guard = new AuthzGuard(
        reflectorReturning(
          { ...publicDeckMeta, scope: SCOPES.MANAGE_PRIVATE_DECK },
          true
        ),
        // ANONYMOUS would be refused this scope too; PUBLIC is what is read.
        new AuthzService(fakeRoleResolver(ROLES.PUBLIC, ROLES.ANONYMOUS)),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        AuthzForbiddenError
      );
    });
  });

  it("writes metadata under AUTHZ_KEY (smoke test)", () => {
    expect(AUTHZ_KEY).toBe("authz");
  });
});
