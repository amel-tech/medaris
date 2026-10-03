import {
  ASSIGNED_ROLES,
  type AuthenticatedUser,
  type AuthzAuditSink,
  type AuthzContextLoader,
  AuthzService,
  ENTITIES,
  type IAuthzContext,
  PERMISSIONS,
  RELATIONS,
  type Relation,
  type ResourceRef,
  type RoleResolver,
  SCOPE_TYPES,
} from "../../src";

const KOSK = "11111111-1111-4111-8111-111111111111";
const COURSE = "55555555-5555-4555-8555-555555555555";
const DECK = "77777777-7777-4777-8777-777777777777";
const platform = { type: SCOPE_TYPES.PLATFORM, id: null } as const;

const resolverReturning = (relation: Relation | null): RoleResolver => ({
  resolve: vi.fn().mockResolvedValue(relation),
});

const emptyContext = (over: Partial<IAuthzContext> = {}): IAuthzContext => ({
  chain: [platform],
  madrasahCourse: false,
  passiveScope: null,
  policies: [],
  roles: [],
  grants: [],
  ...over,
});

const loaderOf = (
  ctx: IAuthzContext = emptyContext(),
  deck: { isPublic: boolean; authorId: string } | null = null
): AuthzContextLoader & { load: ReturnType<typeof vi.fn> } => ({
  load: vi.fn().mockResolvedValue(ctx),
  findDeck: vi.fn().mockResolvedValue(deck),
});

const auditSink = () => ({ record: vi.fn().mockResolvedValue(undefined) });

const user = (sub = "u", realmRoles: string[] = []): AuthenticatedUser => ({
  sub,
  realm_access: { roles: realmRoles },
});

const service = (
  resolver: RoleResolver,
  loader: AuthzContextLoader = loaderOf(),
  audit?: AuthzAuditSink
) => new AuthzService(resolver, loader, audit);

const course: ResourceRef = { entity: ENTITIES.COURSE, id: COURSE };

describe("AuthzService.can", () => {
  describe("SYSTEM_ADMIN realm-role bypass", () => {
    it("allows any permission on any resource regardless of the resolver", async () => {
      const resolver = resolverReturning(null);
      const loader = loaderOf();
      const svc = service(resolver, loader);
      const admin = user("admin", ["SYSTEM_ADMIN"]);
      await expect(
        svc.can(admin, course, PERMISSIONS.COURSE_DELETE)
      ).resolves.toBe(true);
      // Neither the resolver nor the loader is consulted: the bypass short-circuits.
      expect(resolver.resolve).not.toHaveBeenCalled();
      expect(loader.load).not.toHaveBeenCalled();
    });

    it("treats a malformed realm_access.roles claim as no admin", async () => {
      const svc = service(resolverReturning(null));
      const broken: AuthenticatedUser = {
        sub: "u",
        realm_access: { roles: "SYSTEM_ADMIN" as unknown as never },
      };
      await expect(
        svc.can(broken, course, PERMISSIONS.COURSE_DELETE)
      ).resolves.toBe(false);
    });

    it("reads another person's private deck and nothing else, and records the read (MDRS-148)", async () => {
      const audit = auditSink();
      const loader = loaderOf(emptyContext(), {
        isPublic: false,
        authorId: "someone-else",
      });
      const svc = service(resolverReturning(null), loader, audit);
      const admin = user("admin", ["SYSTEM_ADMIN"]);
      const deck: ResourceRef = { entity: ENTITIES.FLASHCARD_DECK, id: DECK };
      await expect(svc.can(admin, deck, PERMISSIONS.DECK_VIEW)).resolves.toBe(
        true
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin",
          action: "deck.admin_read",
          entityId: DECK,
        })
      );
      for (const write of [
        PERMISSIONS.DECK_MANAGE_PRIVATE,
        PERMISSIONS.DECK_MANAGE_CARDS,
        PERMISSIONS.DECK_CREATE_CARD,
      ]) {
        await expect(svc.can(admin, deck, write)).resolves.toBe(false);
      }
    });

    it("still writes to a public deck, and to the başnazım's own private one", async () => {
      const admin = user("admin", ["SYSTEM_ADMIN"]);
      const deck: ResourceRef = { entity: ENTITIES.FLASHCARD_DECK, id: DECK };
      const publicDeck = service(
        resolverReturning(null),
        loaderOf(emptyContext(), { isPublic: true, authorId: "someone-else" })
      );
      await expect(
        publicDeck.can(admin, deck, PERMISSIONS.DECK_MANAGE_PRIVATE)
      ).resolves.toBe(true);
      const own = service(
        resolverReturning(null),
        loaderOf(emptyContext(), { isPublic: false, authorId: "admin" })
      );
      await expect(
        own.can(admin, deck, PERMISSIONS.DECK_MANAGE_PRIVATE)
      ).resolves.toBe(true);
    });
  });

  describe("decisions from the relationship, the roles and the grants", () => {
    it("grants a permission the caller's role holds in the resource's chain", async () => {
      const svc = service(
        resolverReturning(RELATIONS.PUBLIC),
        loaderOf(
          emptyContext({
            chain: [{ type: SCOPE_TYPES.COURSE, id: COURSE }, platform],
            roles: [
              {
                role: ASSIGNED_ROLES.MUDERRIS,
                scope: { type: SCOPE_TYPES.COURSE, id: COURSE },
              },
            ],
          })
        )
      );
      await expect(
        svc.can(user(), course, PERMISSIONS.COURSE_EDIT)
      ).resolves.toBe(true);
    });

    it("denies a permission nothing the caller holds covers", async () => {
      const svc = service(resolverReturning(RELATIONS.ENROLLED));
      await expect(
        svc.can(user(), course, PERMISSIONS.COURSE_HIDE)
      ).resolves.toBe(false);
    });

    it("accepts a list: any one of the permissions will do", async () => {
      const svc = service(
        resolverReturning(RELATIONS.PUBLIC),
        loaderOf(
          emptyContext({
            roles: [{ role: ASSIGNED_ROLES.MEDARIS_NAZIM, scope: platform }],
            grants: [
              {
                scope: platform,
                codes: [PERMISSIONS.PLATFORM_KOSK_EDIT],
                authority: "platform",
              },
            ],
          })
        )
      );
      const kosk: ResourceRef = { entity: ENTITIES.KOSK, id: KOSK };
      await expect(
        svc.can(user(), kosk, [
          PERMISSIONS.KOSK_MANAGE,
          PERMISSIONS.PLATFORM_KOSK_EDIT,
        ])
      ).resolves.toBe(true);
      await expect(
        svc.can(user(), kosk, [
          PERMISSIONS.KOSK_MANAGE,
          PERMISSIONS.PLATFORM_KOSK_CREATE,
        ])
      ).resolves.toBe(false);
    });

    it("denies when the resolver returns null (no PUBLIC fallback)", async () => {
      const loader = loaderOf();
      const svc = service(resolverReturning(null), loader);
      await expect(
        svc.can(user(), course, PERMISSIONS.COURSE_ENROLL)
      ).resolves.toBe(false);
      await expect(
        svc.can(user(), course, PERMISSIONS.COURSE_VIEW)
      ).resolves.toBe(false);
      // A resource nobody has a relationship to is not even looked up.
      expect(loader.load).not.toHaveBeenCalled();
    });

    it("opens the public page and the enrolment to a PUBLIC caller, not the content (MDRS-103)", async () => {
      const svc = service(resolverReturning(RELATIONS.PUBLIC));
      await expect(
        svc.can(user(), course, PERMISSIONS.COURSE_ENROLL)
      ).resolves.toBe(true);
      await expect(
        svc.can(user(), course, PERMISSIONS.COURSE_VIEW)
      ).resolves.toBe(true);
      await expect(
        svc.can(user(), course, PERMISSIONS.COURSE_VIEW_DETAILS)
      ).resolves.toBe(false);
    });

    it("denies a permission of another entity's vocabulary", async () => {
      const svc = service(resolverReturning(RELATIONS.PUBLIC));
      await expect(
        svc.can(
          user(),
          { entity: "made-up" as never, id: "x" },
          PERMISSIONS.COURSE_VIEW
        )
      ).resolves.toBe(false);
    });

    it("refuses a content permission in a passive scope, and records the open by platform management", async () => {
      const audit = auditSink();
      const passive = { type: SCOPE_TYPES.COURSE, id: COURSE } as const;
      const closed = service(
        resolverReturning(RELATIONS.ENROLLED),
        loaderOf(
          emptyContext({
            chain: [passive, platform],
            passiveScope: passive,
          })
        ),
        audit
      );
      await expect(
        closed.can(user(), course, PERMISSIONS.COURSE_VIEW_DETAILS)
      ).resolves.toBe(false);
      expect(audit.record).not.toHaveBeenCalled();

      const opened = service(
        resolverReturning(RELATIONS.PUBLIC),
        loaderOf(
          emptyContext({
            chain: [passive, platform],
            passiveScope: passive,
            roles: [
              { role: ASSIGNED_ROLES.MEDARIS_NAZIM, scope: platform },
              { role: ASSIGNED_ROLES.DERS_NAZIR, scope: passive },
            ],
            grants: [
              {
                scope: platform,
                codes: [PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE],
                authority: "platform",
              },
              {
                scope: passive,
                codes: [PERMISSIONS.COURSE_EDIT],
                authority: "platform",
              },
            ],
          })
        ),
        audit
      );
      await expect(
        opened.can(user("nazim"), course, PERMISSIONS.COURSE_EDIT)
      ).resolves.toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "nazim",
          action: "scope.passive_open",
          entityId: COURSE,
        })
      );
    });

    it("computes the same set for the screens as it decides with", async () => {
      const svc = service(
        resolverReturning(RELATIONS.PUBLIC),
        loaderOf(
          emptyContext({
            chain: [{ type: SCOPE_TYPES.COURSE, id: COURSE }, platform],
            roles: [
              {
                role: ASSIGNED_ROLES.MUDERRIS,
                scope: { type: SCOPE_TYPES.COURSE, id: COURSE },
              },
            ],
          })
        )
      );
      const effective = await svc.effective(user(), course);
      expect(effective?.codes.has(PERMISSIONS.COURSE_EDIT)).toBe(true);
      await expect(
        service(resolverReturning(null)).effective(user(), course)
      ).resolves.toBeNull();
    });
  });

  describe("canAnonymous — a caller with no token (MDRS-45)", () => {
    const deck: ResourceRef = { entity: ENTITIES.FLASHCARD_DECK, id: "d-1" };

    it("refuses when the resolver has no resolveAnonymous at all (fail-closed)", async () => {
      const svc = service(resolverReturning(RELATIONS.PUBLIC));
      await expect(svc.canAnonymous(deck, PERMISSIONS.DECK_VIEW)).resolves.toBe(
        false
      );
    });

    it("grants view on a deck the resolver opens as ANONYMOUS", async () => {
      const svc = service({
        resolve: vi.fn(),
        resolveAnonymous: vi.fn().mockResolvedValue(RELATIONS.ANONYMOUS),
      });
      await expect(svc.canAnonymous(deck, PERMISSIONS.DECK_VIEW)).resolves.toBe(
        true
      );
    });

    it("does not inherit the PUBLIC codes — an anonymous caller may not create a deck", async () => {
      const svc = service({
        resolve: vi.fn(),
        resolveAnonymous: vi.fn().mockResolvedValue(RELATIONS.ANONYMOUS),
      });
      await expect(
        svc.canAnonymous(deck, PERMISSIONS.DECK_CREATE_PRIVATE)
      ).resolves.toBe(false);
    });

    it("refuses a resolver that answers PUBLIC for an anonymous caller", async () => {
      // Past the type narrowing, as a plain-JS resolver or a cast would be.
      const svc = service({
        resolve: vi.fn(),
        resolveAnonymous: vi
          .fn()
          .mockResolvedValue(
            RELATIONS.PUBLIC as unknown as typeof RELATIONS.ANONYMOUS
          ),
      });
      await expect(svc.canAnonymous(deck, PERMISSIONS.DECK_VIEW)).resolves.toBe(
        false
      );
    });

    it("grants an opened course its page but not the enrolment — applying needs an account (MDRS-122)", async () => {
      const svc = service({
        resolve: vi.fn(),
        resolveAnonymous: vi.fn().mockResolvedValue(RELATIONS.ANONYMOUS),
      });
      await expect(
        svc.canAnonymous(course, PERMISSIONS.COURSE_VIEW)
      ).resolves.toBe(true);
      await expect(
        svc.canAnonymous(course, PERMISSIONS.COURSE_ENROLL)
      ).resolves.toBe(false);
      await expect(
        svc.canAnonymous(course, PERMISSIONS.COURSE_VIEW_DETAILS)
      ).resolves.toBe(false);
    });
  });

  describe("isSystemAdmin", () => {
    it("detects the realm role", () => {
      const svc = service(resolverReturning(null));
      expect(svc.isSystemAdmin(user("u", ["SYSTEM_ADMIN"]))).toBe(true);
    });

    it("returns false for users without it", () => {
      const svc = service(resolverReturning(null));
      expect(svc.isSystemAdmin(user("u", ["SOMETHING_ELSE"]))).toBe(false);
    });

    it("returns false for missing realm_access", () => {
      const svc = service(resolverReturning(null));
      expect(svc.isSystemAdmin({ sub: "u" })).toBe(false);
    });
  });
});

describe("the decision and its audit rows (review T5, T8, L1)", () => {
  const passive = { type: SCOPE_TYPES.COURSE, id: COURSE } as const;
  const management = emptyContext({
    chain: [passive, platform],
    passiveScope: passive,
    roles: [{ role: ASSIGNED_ROLES.MEDARIS_NAZIM, scope: platform }],
    grants: [
      {
        scope: platform,
        codes: [PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE],
        authority: "platform",
      },
    ],
  });

  it("computes, for every code of the catalogue, the same answer for the screens as for the route", async () => {
    const ctx = emptyContext({
      chain: [
        { type: SCOPE_TYPES.COURSE, id: COURSE },
        { type: SCOPE_TYPES.KOSK, id: KOSK },
        platform,
      ],
      roles: [
        {
          role: ASSIGNED_ROLES.DERS_NAZIR,
          scope: { type: SCOPE_TYPES.COURSE, id: COURSE },
        },
        {
          role: ASSIGNED_ROLES.KOSK_NAZIM,
          scope: { type: SCOPE_TYPES.KOSK, id: KOSK },
        },
      ],
      grants: [
        {
          scope: { type: SCOPE_TYPES.COURSE, id: COURSE },
          codes: [PERMISSIONS.COURSE_EDIT, PERMISSIONS.BAN_COURSE],
          authority: null,
        },
      ],
    });
    const svc = service(resolverReturning(RELATIONS.ENROLLED), loaderOf(ctx));
    const effective = await svc.effective(user(), course);
    for (const code of Object.values(PERMISSIONS)) {
      await expect(svc.can(user(), course, code), code).resolves.toBe(
        effective?.codes.has(code) ?? false
      );
    }
  });

  it("writes the passive-open row for the başnazım's content read, and for no page view", async () => {
    const audit = auditSink();
    const svc = service(
      resolverReturning(RELATIONS.PUBLIC),
      loaderOf(
        emptyContext({ chain: [passive, platform], passiveScope: passive })
      ),
      audit
    );
    const admin = user("admin", ["SYSTEM_ADMIN"]);
    await svc.can(admin, course, PERMISSIONS.COURSE_VIEW);
    expect(audit.record).not.toHaveBeenCalled();
    await svc.can(admin, course, PERMISSIONS.COURSE_EDIT);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin",
        action: "scope.passive_open",
        entityId: COURSE,
      })
    );
  });

  it("writes nothing when platform management only views the page of a passive course (L1)", async () => {
    const audit = auditSink();
    const svc = service(
      resolverReturning(RELATIONS.PUBLIC),
      loaderOf(management),
      audit
    );
    await expect(
      svc.can(user("nazim"), course, PERMISSIONS.COURSE_VIEW)
    ).resolves.toBe(true);
    expect(audit.record).not.toHaveBeenCalled();
    await expect(
      svc.can(user("nazim"), course, PERMISSIONS.COURSE_STAFF_READ)
    ).resolves.toBe(true);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("fails the decision when the audit row cannot be written, and never allows it unrecorded", async () => {
    const audit = { record: vi.fn().mockRejectedValue(new Error("db down")) };
    const svc = service(
      resolverReturning(RELATIONS.PUBLIC),
      loaderOf(management),
      audit
    );
    await expect(
      svc.can(user("nazim"), course, PERMISSIONS.COURSE_STAFF_READ)
    ).rejects.toThrow("db down");
    const admin = user("admin", ["SYSTEM_ADMIN"]);
    await expect(
      service(
        resolverReturning(RELATIONS.PUBLIC),
        loaderOf(
          emptyContext({ chain: [passive, platform], passiveScope: passive })
        ),
        audit
      ).can(admin, course, PERMISSIONS.COURSE_EDIT)
    ).rejects.toThrow("db down");
  });
});
