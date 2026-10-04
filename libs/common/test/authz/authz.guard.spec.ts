import { ExecutionContext, NotFoundException } from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import {
  ASSIGNED_ROLES,
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  AuthzContextLoader,
  AuthzForbiddenError,
  AuthzGuard,
  AuthzMeta,
  AuthzMissingUserError,
  AuthzResolverError,
  AuthzService,
  ENTITIES,
  IAuthzContext,
  PERMISSIONS,
  RELATIONS,
  RoleResolver,
  SCOPE_TYPES,
} from "../../src";

const platform = { type: SCOPE_TYPES.PLATFORM, id: null } as const;

const contextWith = (
  over: Partial<IAuthzContext> = {}
): AuthzContextLoader => ({
  load: vi.fn().mockResolvedValue({
    chain: [platform],
    madrasahCourse: false,
    passiveScope: null,
    policies: [],
    roles: [],
    grants: [],
    ...over,
  }),
  findDeck: vi.fn().mockResolvedValue(null),
});

/** The caller teaches course c-1. */
const muderrisLoader = () =>
  contextWith({
    chain: [{ type: SCOPE_TYPES.COURSE, id: "c-1" }, platform],
    roles: [
      {
        role: ASSIGNED_ROLES.MUDERRIS,
        scope: { type: SCOPE_TYPES.COURSE, id: "c-1" },
      },
    ],
  });

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
  anonymousRole?: typeof RELATIONS.ANONYMOUS | null
): RoleResolver => ({
  resolve: vi.fn().mockResolvedValue(role),
  ...(anonymousRole !== undefined && {
    resolveAnonymous: vi.fn().mockResolvedValue(anonymousRole),
  }),
});

const publicDeckMeta: AuthzMeta = {
  permission: PERMISSIONS.DECK_VIEW,
  resolve: () => ({ entity: ENTITIES.FLASHCARD_DECK, id: "d-1" }),
};

const moduleRefStub = {} as ModuleRef;

describe("AuthzGuard", () => {
  it("passes through when no @Authz metadata is present", async () => {
    const guard = new AuthzGuard(
      reflectorReturning(),
      new AuthzService(fakeRoleResolver(null), contextWith()),
      moduleRefStub
    );
    const { ctx } = buildContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("throws AuthzMissingUserError when metadata is set but user is absent", async () => {
    const meta: AuthzMeta = {
      permission: PERMISSIONS.COURSE_EDIT,
      resolve: () => ({ entity: ENTITIES.COURSE, id: "c-1" }),
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(null), contextWith()),
      moduleRefStub
    );
    const { ctx } = buildContext({ params: { id: "c-1" } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      AuthzMissingUserError
    );
  });

  it("allows when AuthzService.can resolves true", async () => {
    const meta: AuthzMeta = {
      permission: PERMISSIONS.COURSE_EDIT,
      resolve: () => ({ entity: ENTITIES.COURSE, id: "c-1" }),
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(RELATIONS.PUBLIC), muderrisLoader()),
      moduleRefStub
    );
    const { ctx } = buildContext({ user: { sub: "u-1" } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("throws AuthzForbiddenError with structured context when denied", async () => {
    const meta: AuthzMeta = {
      permission: PERMISSIONS.COURSE_OPEN_STANDALONE,
      resolve: () => ({ entity: ENTITIES.COURSE, id: "c-1" }),
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(RELATIONS.PUBLIC), muderrisLoader()),
      moduleRefStub
    );
    const { ctx } = buildContext({ user: { sub: "u-1" } });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      name: "AuthzForbiddenError",
      context: {
        userId: "u-1",
        entity: "course",
        resourceId: "c-1",
        permission: "course.open_standalone",
      },
    });
  });

  it("awaits async resolvers and passes ModuleRef into them", async () => {
    const fakeMod = { tag: "mod-stub" } as unknown as ModuleRef;
    let observedMod: unknown;
    const meta: AuthzMeta = {
      permission: PERMISSIONS.DECK_VIEW,
      resolve: async (_req, mod) => {
        observedMod = mod;
        return { entity: ENTITIES.FLASHCARD_DECK, id: "d-1" };
      },
    };
    const guard = new AuthzGuard(
      reflectorReturning(meta),
      new AuthzService(fakeRoleResolver(RELATIONS.PUBLIC), contextWith()), // explicit PUBLIC for view ✓ on flashcard-deck
      fakeMod
    );
    const { ctx } = buildContext({ user: { sub: "u-1" } });
    await guard.canActivate(ctx);
    expect(observedMod).toBe(fakeMod);
  });

  describe("resolver failure modes", () => {
    it("wraps unknown errors in AuthzResolverError (500)", async () => {
      const meta: AuthzMeta = {
        permission: PERMISSIONS.DECK_VIEW,
        resolve: () => {
          throw new Error("boom");
        },
      };
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(fakeRoleResolver(null), contextWith()),
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
        permission: PERMISSIONS.DECK_VIEW,
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
      expect(context).toEqual({ permission: PERMISSIONS.DECK_VIEW });
      expect(cause).toBe(thrown);
    });

    it("lets HttpException propagate (so 404 stays 404)", async () => {
      const meta: AuthzMeta = {
        permission: PERMISSIONS.DECK_VIEW,
        resolve: () => {
          throw new NotFoundException("missing");
        },
      };
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(fakeRoleResolver(null), contextWith()),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("rejects empty resource IDs as a configuration error", async () => {
      const meta: AuthzMeta = {
        permission: PERMISSIONS.DECK_VIEW,
        resolve: () => ({ entity: ENTITIES.COURSE, id: "" }),
      };
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(fakeRoleResolver(null), contextWith()),
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
        new AuthzService(fakeRoleResolver(null), contextWith()),
        moduleRefStub
      );
      const { ctx } = buildContext({});
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it("allows an anonymous caller when the resolver answers ANONYMOUS and the permission is one of its anonymous codes", async () => {
      const resolver = fakeRoleResolver(null, RELATIONS.ANONYMOUS);
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

    it("refuses an anonymous caller with 401 when it is not one of the anonymous codes", async () => {
      const guard = new AuthzGuard(
        reflectorReturning(
          { ...publicDeckMeta, permission: PERMISSIONS.DECK_MANAGE_PRIVATE },
          true
        ),
        new AuthzService(
          fakeRoleResolver(null, RELATIONS.ANONYMOUS),
          contextWith()
        ),
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
            permission: PERMISSIONS.DECK_VIEW,
            resolve: () => {
              throw new NotFoundException("missing");
            },
          },
          true
        ),
        new AuthzService(
          fakeRoleResolver(null, RELATIONS.ANONYMOUS),
          contextWith()
        ),
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
          { ...publicDeckMeta, permission: PERMISSIONS.DECK_MANAGE_PRIVATE },
          true
        ),
        // ANONYMOUS would be refused this permission too; PUBLIC is what is read.
        new AuthzService(
          fakeRoleResolver(RELATIONS.PUBLIC, RELATIONS.ANONYMOUS),
          contextWith()
        ),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        AuthzForbiddenError
      );
    });
  });

  describe("a closed resource (resolver.closure)", () => {
    class Closed extends NotFoundException {}
    const meta: AuthzMeta = {
      permission: PERMISSIONS.COURSE_VIEW,
      resolve: () => ({ entity: ENTITIES.COURSE, id: "c-1" }),
    };
    const closedResolver = (): RoleResolver => ({
      resolve: vi.fn().mockResolvedValue(RELATIONS.PUBLIC),
      closure: vi.fn().mockResolvedValue({
        openTo: [PERMISSIONS.COURSE_HIDE],
        notFound: new Closed("closed"),
      }),
    });

    it("answers the closure's 404 to a signed-in caller who does not hold the codes, before it decides", async () => {
      const loader = contextWith();
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(closedResolver(), loader),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Closed);
    });

    it("lets the caller who holds a code through to the decision", async () => {
      const guard = new AuthzGuard(
        reflectorReturning(meta),
        new AuthzService(
          closedResolver(),
          contextWith({
            chain: [{ type: SCOPE_TYPES.KOSK, id: "k-1" }, platform],
            roles: [
              {
                role: ASSIGNED_ROLES.KOSK_NAZIM,
                scope: { type: SCOPE_TYPES.KOSK, id: "k-1" },
              },
            ],
          })
        ),
        moduleRefStub
      );
      const { ctx } = buildContext({ user: { sub: "u-1" } });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  it("writes metadata under AUTHZ_KEY (smoke test)", () => {
    expect(AUTHZ_KEY).toBe("authz");
  });
});
