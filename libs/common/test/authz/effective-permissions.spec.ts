import {
  ASSIGNED_ROLES,
  authorityAbove,
  ENTITIES,
  effectivePermissions,
  type IAuthzFacts,
  type IHeldGrantCodes,
  type IHeldRole,
  type IPolicyOn,
  PERMISSION_META,
  PERMISSIONS,
  type PermissionCode,
  POLICY_KEYS,
  RELATIONS,
  ROLE_DEFAULT_PERMISSIONS,
  relationCodes,
  SCOPE_TYPES,
  type ScopeRef,
} from "../../src";

const KOSK = "11111111-1111-4111-8111-111111111111";
const OTHER_KOSK = "22222222-2222-4222-8222-222222222222";
const MADRASAH = "33333333-3333-4333-8333-333333333333";
const OTHER_MADRASAH = "44444444-4444-4444-8444-444444444444";
const COURSE = "55555555-5555-4555-8555-555555555555";
const OTHER_COURSE = "66666666-6666-4666-8666-666666666666";

const platform: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };
const kosk = (id = KOSK): ScopeRef => ({ type: SCOPE_TYPES.KOSK, id });
const madrasah = (id = MADRASAH): ScopeRef => ({
  type: SCOPE_TYPES.MADRASAH,
  id,
});
const course = (id = COURSE): ScopeRef => ({ type: SCOPE_TYPES.COURSE, id });

/** A course held in a köşk, optionally for a medrese: its chain, narrowest first. */
const courseFacts = (
  over: Partial<IAuthzFacts> & { medrese?: boolean } = {}
): IAuthzFacts => {
  const { medrese = false, ...rest } = over;
  return {
    entity: "course",
    relation: RELATIONS.PUBLIC,
    chain: medrese
      ? [course(), madrasah(), kosk(), platform]
      : [course(), kosk(), platform],
    madrasahCourse: medrese,
    passiveScope: null,
    policies: [],
    ...rest,
  };
};

const role = (r: IHeldRole["role"], scope: ScopeRef, expiresAt?: Date) =>
  ({ role: r, scope, expiresAt }) as IHeldRole;

const grant = (
  scope: ScopeRef,
  codes: PermissionCode[],
  authority: IHeldGrantCodes["authority"] = null,
  expiresAt?: Date
): IHeldGrantCodes => ({ scope, codes, authority, expiresAt });

const held = (
  facts: IAuthzFacts,
  roles: IHeldRole[] = [],
  grants: IHeldGrantCodes[] = [],
  now?: Date
) => effectivePermissions(facts, roles, grants, now).codes;

const P = PERMISSIONS;

describe("effective permissions: role defaults (MDRS-135 AC 1)", () => {
  it("a köşk nazımı holds every köşk- and course-scoped code in its köşk and its courses", () => {
    const codes = held(courseFacts(), [
      role(ASSIGNED_ROLES.KOSK_NAZIM, kosk()),
    ]);
    for (const code of ROLE_DEFAULT_PERMISSIONS.KOSK_NAZIM) {
      expect(codes.has(code), code).toBe(true);
    }
    expect(codes.has(P.COURSE_HIDE)).toBe(true);
    expect(codes.has(P.BAN_COURSE)).toBe(true);
    expect(codes.has(P.COURSE_STAFF_READ)).toBe(true);
    // Never the platform's or the medrese's.
    expect(codes.has(P.PLATFORM_KOSK_EDIT)).toBe(false);
    expect(codes.has(P.MADRASAH_COURSE_OPEN)).toBe(false);
  });

  it("a köşk nazımı holds nothing in another köşk", () => {
    const codes = held(
      courseFacts({ chain: [course(), kosk(OTHER_KOSK), platform] }),
      [role(ASSIGNED_ROLES.KOSK_NAZIM, kosk())]
    );
    expect(codes.has(P.COURSE_EDIT)).toBe(false);
    expect(codes.has(P.COURSE_STAFF_READ)).toBe(false);
  });

  it("in a medrese course a köşk nazımı reads, bans and hides, but does not open or staff it (owner, 1 October)", () => {
    const codes = held(courseFacts({ medrese: true }), [
      role(ASSIGNED_ROLES.KOSK_NAZIM, kosk()),
    ]);
    expect(codes.has(P.COURSE_VIEW_DETAILS)).toBe(true);
    expect(codes.has(P.BAN_COURSE)).toBe(true);
    expect(codes.has(P.COURSE_HIDE)).toBe(true);
    expect(codes.has(P.COURSE_OPEN_STANDALONE)).toBe(false);
    expect(codes.has(P.MADRASAH_MUDERRIS_MANAGE)).toBe(false);
  });

  it("in the köşk's own course a köşk nazımı does choose the müderrisler", () => {
    const codes = held(courseFacts(), [
      role(ASSIGNED_ROLES.KOSK_NAZIM, kosk()),
    ]);
    expect(codes.has(P.COURSE_OPEN_STANDALONE)).toBe(true);
    expect(codes.has(P.MADRASAH_MUDERRIS_MANAGE)).toBe(false);
  });

  it("a başmüderris holds every medrese- and course-scoped code in its medrese and the medrese's courses", () => {
    const codes = held(courseFacts({ medrese: true }), [
      role(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasah()),
    ]);
    expect(codes.has(P.MADRASAH_MUDERRIS_MANAGE)).toBe(true);
    expect(codes.has(P.MADRASAH_COURSE_HIDE)).toBe(true);
    expect(codes.has(P.COURSE_EDIT)).toBe(true);
    expect(codes.has(P.COURSE_STAFF_READ)).toBe(true);
    expect(codes.has(P.KOSK_MANAGE)).toBe(false);
    expect(codes.has(P.COURSE_HIDE)).toBe(false);
  });

  it("a başmüderris holds nothing in another medrese's course", () => {
    const codes = held(
      courseFacts({
        medrese: true,
        chain: [course(), madrasah(OTHER_MADRASAH), kosk(), platform],
      }),
      [role(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasah())]
    );
    expect(codes.has(P.COURSE_EDIT)).toBe(false);
  });

  it("a müderris holds every course-scoped code in its own course only", () => {
    const own = held(courseFacts(), [role(ASSIGNED_ROLES.MUDERRIS, course())]);
    for (const code of ROLE_DEFAULT_PERMISSIONS.MUDERRIS) {
      expect(own.has(code), code).toBe(true);
    }
    expect(own.has(P.COURSE_HIDE)).toBe(false);
    expect(own.has(P.COURSE_OPEN_STANDALONE)).toBe(false);
    const sibling = held(
      courseFacts({ chain: [course(OTHER_COURSE), kosk(), platform] }),
      [role(ASSIGNED_ROLES.MUDERRIS, course())]
    );
    expect(sibling.has(P.COURSE_EDIT)).toBe(false);
  });

  it("the Medaris nazımı, the medrese nazırı and the ders nazırı hold nothing without a grant", () => {
    const facts = courseFacts({ medrese: true });
    for (const [r, scope] of [
      [ASSIGNED_ROLES.MEDARIS_NAZIM, platform],
      [ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah()],
      [ASSIGNED_ROLES.DERS_NAZIR, course()],
    ] as const) {
      const codes = held(facts, [role(r, scope)]);
      // Only what any signed-in caller holds on a course page.
      expect([...codes].sort()).toEqual(
        [P.COURSE_VIEW, P.COURSE_ENROLL].sort()
      );
    }
  });

  it("a role that has run out holds nothing", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const codes = held(
      courseFacts(),
      [
        role(
          ASSIGNED_ROLES.KOSK_NAZIM,
          kosk(),
          new Date("2026-10-10T09:59:59Z")
        ),
      ],
      [],
      now
    );
    expect(codes.has(P.COURSE_EDIT)).toBe(false);
  });
});

describe("effective permissions: grants (MDRS-135 AC 1)", () => {
  const nazir = role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah());

  it("a medrese nazırı holds exactly what is granted, in that medrese only", () => {
    const grants = [
      grant(madrasah(), [P.MADRASAH_STUDENTS_VIEW, P.MADRASAH_BAN]),
    ];
    const here = held(
      {
        entity: "madrasah",
        relation: RELATIONS.PUBLIC,
        chain: [madrasah(), platform],
        madrasahCourse: false,
        passiveScope: null,
        policies: [],
      },
      [nazir],
      grants
    );
    expect(here.has(P.MADRASAH_STUDENTS_VIEW)).toBe(true);
    expect(here.has(P.MADRASAH_BAN)).toBe(true);
    expect(here.has(P.MADRASAH_COURSE_OPEN)).toBe(false);
    const elsewhere = held(
      {
        entity: "madrasah",
        relation: RELATIONS.PUBLIC,
        chain: [madrasah(OTHER_MADRASAH), platform],
        madrasahCourse: false,
        passiveScope: null,
        policies: [],
      },
      [nazir],
      grants
    );
    expect(elsewhere.has(P.MADRASAH_STUDENTS_VIEW)).toBe(false);
  });

  it("course permissions granted in a medrese reach that medrese's courses and no other", () => {
    const grants = [grant(madrasah(), [P.COURSE_EDIT, P.ENROLLMENT_DECIDE])];
    const inside = held(courseFacts({ medrese: true }), [nazir], grants);
    expect(inside.has(P.COURSE_EDIT)).toBe(true);
    expect(inside.has(P.ENROLLMENT_DECIDE)).toBe(true);
    expect(inside.has(P.BAN_COURSE)).toBe(false);
    const outside = held(
      courseFacts({
        medrese: true,
        chain: [course(), madrasah(OTHER_MADRASAH), kosk(), platform],
      }),
      [nazir],
      grants
    );
    expect(outside.has(P.COURSE_EDIT)).toBe(false);
  });

  it("a course-scoped grant reaches that course alone", () => {
    const derS = role(ASSIGNED_ROLES.DERS_NAZIR, course());
    const grants = [grant(course(), [P.SESSION_MANAGE])];
    expect(held(courseFacts(), [derS], grants).has(P.SESSION_MANAGE)).toBe(
      true
    );
    const sibling = held(
      courseFacts({ chain: [course(OTHER_COURSE), kosk(), platform] }),
      [derS],
      grants
    );
    expect(sibling.has(P.SESSION_MANAGE)).toBe(false);
  });

  it("a grant to 'every course' reaches every course the holder has a role above", () => {
    const grants = [
      grant({ type: SCOPE_TYPES.COURSE, id: null }, [P.SESSION_MANAGE]),
    ];
    const codes = held(
      courseFacts({ chain: [course(OTHER_COURSE), kosk(), platform] }),
      [role(ASSIGNED_ROLES.DERS_NAZIR, course(OTHER_COURSE))],
      grants
    );
    expect(codes.has(P.SESSION_MANAGE)).toBe(true);
  });

  it("a grant that has expired holds nothing, without the role changing", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const grants = [
      grant(
        madrasah(),
        [P.COURSE_EDIT],
        null,
        new Date("2026-10-10T09:00:00Z")
      ),
    ];
    expect(
      held(courseFacts({ medrese: true }), [nazir], grants, now).has(
        P.COURSE_EDIT
      )
    ).toBe(false);
    // The same grant, an hour earlier, still holds.
    expect(
      held(
        courseFacts({ medrese: true }),
        [nazir],
        grants,
        new Date("2026-10-10T08:00:00Z")
      ).has(P.COURSE_EDIT)
    ).toBe(true);
  });

  it("a grant never outlasts its role", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const grants = [grant(madrasah(), [P.COURSE_EDIT])];
    const lapsed = role(
      ASSIGNED_ROLES.MEDRESE_NAZIR,
      madrasah(),
      new Date("2026-10-10T09:00:00Z")
    );
    expect(
      held(courseFacts({ medrese: true }), [lapsed], grants, now).has(
        P.COURSE_EDIT
      )
    ).toBe(false);
    expect(
      held(courseFacts({ medrese: true }), [], grants, now).has(P.COURSE_EDIT)
    ).toBe(false);
  });

  it("ignores the permission to grant, even in a stored grant", () => {
    const codes = held(
      courseFacts({ medrese: true }),
      [nazir],
      [grant(madrasah(), [P.PERMISSION_GRANT])]
    );
    expect(codes.has(P.PERMISSION_GRANT)).toBe(false);
  });

  it("a ders nazırı cannot grant anything, whatever they hold", () => {
    const everything = LISTED(P);
    const codes = held(
      courseFacts(),
      [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
      [grant(course(), everything)]
    );
    expect(codes.has(P.PERMISSION_GRANT)).toBe(false);
    expect(codes.has(P.COURSE_NAZIR_ASSIGN)).toBe(true);
  });

  it("a platform grant needs the Medaris nazımı's role under it", () => {
    const facts = courseFacts();
    const grants = [grant(platform, [P.PLATFORM_AUDIT_READ])];
    expect(
      held(facts, [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)], grants).has(
        P.PLATFORM_AUDIT_READ
      )
    ).toBe(true);
    expect(held(facts, [], grants).has(P.PLATFORM_AUDIT_READ)).toBe(false);
  });
});

/** Every listed, grantable course- or köşk-level code (what a careless grant might carry). */
function LISTED(permissions: typeof PERMISSIONS): PermissionCode[] {
  return (Object.values(permissions) as PermissionCode[]).filter(
    (code) => !PERMISSION_META[code].implicit
  );
}

describe("effective permissions: policies (MDRS-135 AC 1 and 2)", () => {
  const muderris = role(ASSIGNED_ROLES.MUDERRIS, course());
  const kosk_policy = (key: IPolicyOn["key"]): IPolicyOn => ({
    key,
    level: SCOPE_TYPES.KOSK,
    scopeId: KOSK,
  });
  const platform_policy = (key: IPolicyOn["key"]): IPolicyOn => ({
    key,
    level: SCOPE_TYPES.PLATFORM,
    scopeId: null,
  });

  it("a course's settings holder may turn approval off while no policy says it always applies", () => {
    expect(held(courseFacts(), [muderris]).has(P.SETTING_APPROVAL_OFF)).toBe(
      true
    );
  });

  it("a policy that removes a permission removes it for the people who hold it by role", () => {
    const facts = courseFacts({
      policies: [kosk_policy(POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL)],
    });
    const codes = held(facts, [muderris]);
    expect(codes.has(P.SETTING_APPROVAL_OFF)).toBe(false);
    // Only that ability: the rest of course.settings stays.
    expect(codes.has(P.COURSE_SETTINGS)).toBe(true);
    expect(codes.has(P.SETTING_RECORDINGS_PUBLIC)).toBe(true);
  });

  it("the three policies close three different abilities", () => {
    const closed = (key: IPolicyOn["key"]) =>
      [
        P.SETTING_APPROVAL_OFF,
        P.SETTING_RECORDINGS_PUBLIC,
        P.SETTING_COURSE_OPEN,
      ]
        .filter(
          (code) =>
            !held(courseFacts({ policies: [kosk_policy(key)] }), [
              muderris,
            ]).has(code)
        )
        .sort();
    expect(closed(POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL)).toEqual([
      P.SETTING_APPROVAL_OFF,
    ]);
    expect(closed(POLICY_KEYS.RECORDINGS_NEVER_PUBLIC)).toEqual([
      P.SETTING_RECORDINGS_PUBLIC,
    ]);
    expect(closed(POLICY_KEYS.CLOSED_COURSE_REQUIRED)).toEqual([
      P.SETTING_COURSE_OPEN,
    ]);
  });

  it("a grant from an authority above the policy's level bypasses that policy, and no other", () => {
    const delegate = role(ASSIGNED_ROLES.DERS_NAZIR, course());
    const platformMade = [grant(course(), [P.COURSE_SETTINGS], "platform")];
    const koskMade = [grant(course(), [P.COURSE_SETTINGS], "kosk")];

    const underKosk = courseFacts({
      policies: [kosk_policy(POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL)],
    });
    // The platform is above the köşk: the ability survives the köşk's policy…
    expect(
      held(underKosk, [delegate], platformMade).has(P.SETTING_APPROVAL_OFF)
    ).toBe(true);
    // …but a köşk nazımı's grant is at the policy's own level, not above it.
    expect(
      held(underKosk, [delegate], koskMade).has(P.SETTING_APPROVAL_OFF)
    ).toBe(false);

    // And no grant outranks the platform's own policy.
    const underPlatform = courseFacts({
      policies: [platform_policy(POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL)],
    });
    expect(
      held(underPlatform, [delegate], platformMade).has(P.SETTING_APPROVAL_OFF)
    ).toBe(false);

    // The bypass is for the policy it outranks only: another policy still closes.
    const both = courseFacts({
      policies: [
        kosk_policy(POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL),
        platform_policy(POLICY_KEYS.RECORDINGS_NEVER_PUBLIC),
      ],
    });
    const codes = held(both, [delegate], platformMade);
    expect(codes.has(P.SETTING_APPROVAL_OFF)).toBe(true);
    expect(codes.has(P.SETTING_RECORDINGS_PUBLIC)).toBe(false);
  });

  it("a grant without a recorded authority counts as made at its own scope", () => {
    const delegate = role(ASSIGNED_ROLES.DERS_NAZIR, course());
    const legacy = [grant(course(), [P.COURSE_SETTINGS], null)];
    const codes = held(
      courseFacts({
        policies: [kosk_policy(POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL)],
      }),
      [delegate],
      legacy
    );
    // A course-scoped legacy grant is not above the köşk.
    expect(codes.has(P.SETTING_APPROVAL_OFF)).toBe(false);
  });

  it("knows which authority is above which level", () => {
    expect(authorityAbove("platform", "kosk")).toBe(true);
    expect(authorityAbove("platform", "madrasah")).toBe(true);
    expect(authorityAbove("platform", "platform")).toBe(false);
    expect(authorityAbove("kosk", "course")).toBe(true);
    expect(authorityAbove("madrasah", "course")).toBe(true);
    // A köşk and a medrese are not above one another.
    expect(authorityAbove("kosk", "madrasah")).toBe(false);
    expect(authorityAbove("madrasah", "kosk")).toBe(false);
    expect(authorityAbove("course", "course")).toBe(false);
  });
});

describe("effective permissions: passive scopes and relationships", () => {
  it("a passive scope closes content to everyone, the enrolled included", () => {
    const facts = courseFacts({
      relation: RELATIONS.ENROLLED,
      passiveScope: kosk(),
    });
    const codes = held(facts, [role(ASSIGNED_ROLES.KOSK_NAZIM, kosk())]);
    expect(codes.has(P.COURSE_VIEW)).toBe(true); // the page is not content
    expect(codes.has(P.COURSE_VIEW_DETAILS)).toBe(false);
    expect(codes.has(P.COURSE_EDIT)).toBe(false);
    expect(codes.has(P.COURSE_STAFF_READ)).toBe(false);
  });

  it("platform management holding the permission opens it, and the open is flagged for the audit", () => {
    const facts = courseFacts({ passiveScope: course() });
    const result = effectivePermissions(
      facts,
      [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)],
      [
        grant(platform, [P.PLATFORM_INACTIVE_SCOPES_MANAGE]),
        grant(course(), [P.COURSE_EDIT]),
      ]
    );
    expect(result.openedPassive).toEqual(course());
    expect(result.codes.has(P.COURSE_EDIT)).toBe(true);
    // The permission is for opening: they read the content though no role of
    // theirs reaches it.
    const readOnly = effectivePermissions(
      facts,
      [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)],
      [grant(platform, [P.PLATFORM_INACTIVE_SCOPES_MANAGE])]
    );
    expect(readOnly.codes.has(P.COURSE_VIEW_DETAILS)).toBe(true);
    // In a scope that is not passive the same permission reads nothing.
    expect(
      held(
        courseFacts(),
        [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)],
        [grant(platform, [P.PLATFORM_INACTIVE_SCOPES_MANAGE])]
      ).has(P.COURSE_VIEW_DETAILS)
    ).toBe(false);
    // Without the permission the same person is shut out.
    const without = effectivePermissions(
      facts,
      [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)],
      [grant(course(), [P.COURSE_EDIT])]
    );
    expect(without.openedPassive).toBeNull();
    expect(without.codes.has(P.COURSE_EDIT)).toBe(false);
  });

  it("an enrolled talebe reads the content, a pending one does not", () => {
    expect(
      held(courseFacts({ relation: RELATIONS.ENROLLED })).has(
        P.COURSE_VIEW_DETAILS
      )
    ).toBe(true);
    expect(
      held(courseFacts({ relation: RELATIONS.PENDING })).has(
        P.COURSE_VIEW_DETAILS
      )
    ).toBe(false);
  });

  it("whoever does enrollment work in the course also reads its talebeler and content", () => {
    const codes = held(
      courseFacts({ medrese: true }),
      [role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah())],
      [grant(madrasah(), [P.ENROLLMENT_DECIDE])]
    );
    expect(codes.has(P.COURSE_STAFF_READ)).toBe(true);
    expect(codes.has(P.COURSE_VIEW_DETAILS)).toBe(true);
    // A grant of medrese work alone does not make someone course staff.
    const medreseOnly = held(
      courseFacts({ medrese: true }),
      [role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah())],
      [grant(madrasah(), [P.MADRASAH_BAN])]
    );
    expect(medreseOnly.has(P.COURSE_STAFF_READ)).toBe(false);
  });
});

describe("ids compare lower-cased (review H1)", () => {
  // The other ids here are all digits, which upper case does not change.
  const LOWER_COURSE = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const LOWER_KOSK = "fedcbafe-dcba-4fed-8cba-fedcbafedcba";

  it("a role and a grant held at a lower-case id still count when the chain spells it in upper case", () => {
    const facts = courseFacts({
      chain: [course(LOWER_COURSE.toUpperCase()), kosk(), platform],
    });
    const viaRole = held(facts, [
      role(ASSIGNED_ROLES.MUDERRIS, course(LOWER_COURSE)),
    ]);
    expect(viaRole.has(P.COURSE_EDIT)).toBe(true);
    const viaGrant = held(
      facts,
      [role(ASSIGNED_ROLES.DERS_NAZIR, course(LOWER_COURSE))],
      [grant(course(LOWER_COURSE), [P.COURSE_EDIT])]
    );
    expect(viaGrant.has(P.COURSE_EDIT)).toBe(true);
  });

  it("a köşk nazımı's role covers a course whose köşk id is spelled in upper case", () => {
    const facts = courseFacts({
      chain: [course(), kosk(LOWER_KOSK.toUpperCase()), platform],
    });
    const codes = held(facts, [
      role(ASSIGNED_ROLES.KOSK_NAZIM, kosk(LOWER_KOSK)),
    ]);
    expect(codes.has(P.COURSE_EDIT)).toBe(true);
  });

  it("still keeps another scope out: a different id is not the same id in another case", () => {
    const facts = courseFacts({
      chain: [course(LOWER_COURSE.toUpperCase()), kosk(), platform],
    });
    const codes = held(facts, [
      role(
        ASSIGNED_ROLES.MUDERRIS,
        course("00000000-0000-4000-8000-00000000000a")
      ),
    ]);
    expect(codes.has(P.COURSE_EDIT)).toBe(false);
  });
});

describe("what implies reading the roster and the content (review M1)", () => {
  const asDersNazir = (...codes: PermissionCode[]) =>
    held(
      courseFacts(),
      [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
      [grant(course(), codes)]
    );

  it("a grant unrelated to the talebeler or the course's content opens neither the roster nor the content", () => {
    for (const code of [
      P.WEEK_HIDE,
      P.BAN_COURSE,
      P.BAN_LIFT_COURSE,
      P.DECK_MANAGE_COURSE,
      P.DECK_PROPOSE_KOSK,
      P.COURSE_NAZIR_ASSIGN,
    ]) {
      const codes = asDersNazir(code);
      expect(codes.has(code), code).toBe(true);
      expect(codes.has(P.COURSE_STAFF_READ), `${code} staff_read`).toBe(false);
      expect(codes.has(P.COURSE_VIEW_DETAILS), `${code} details`).toBe(false);
    }
  });

  it("enrollment work opens the roster and the details, every other piece of course work only the details", () => {
    for (const code of [
      P.ENROLLMENT_DECIDE,
      P.ENROLLMENT_REMOVE,
      P.ENROLLMENT_COMPLETE,
    ]) {
      const codes = asDersNazir(code);
      expect(codes.has(P.COURSE_STAFF_READ), code).toBe(true);
      expect(codes.has(P.COURSE_VIEW_DETAILS), code).toBe(true);
    }
    for (const code of [
      P.COURSE_EDIT,
      P.SESSION_MANAGE,
      P.SESSION_LIVE_LINK,
      P.SESSION_VIEW_CONTENT,
      P.RECORDING_MANAGE,
      P.RECORDING_UPLOAD,
      P.RECORDING_WATCH_RESTRICTED,
      P.COURSE_SETTINGS,
      P.COURSE_PUBLISH,
      P.COURSE_VIEW_UNPUBLISHED,
    ]) {
      const codes = asDersNazir(code);
      expect(codes.has(P.COURSE_VIEW_DETAILS), code).toBe(true);
      expect(codes.has(P.COURSE_STAFF_READ), code).toBe(false);
    }
  });

  it("the roles that hold the course work by default still read both, so course staff see the talebe list (MDRS-203)", () => {
    for (const [r, scope, medrese] of [
      [ASSIGNED_ROLES.MUDERRIS, course(), false],
      [ASSIGNED_ROLES.KOSK_NAZIM, kosk(), false],
      [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasah(), true],
    ] as const) {
      const codes = held(courseFacts({ medrese }), [role(r, scope)]);
      expect(codes.has(P.COURSE_STAFF_READ), r).toBe(true);
      expect(codes.has(P.COURSE_VIEW_DETAILS), r).toBe(true);
    }
  });
});

describe("what must not be held, one case for each rule a mutation could drop (review T3, T6)", () => {
  it("a köşk role does not keep a medrese-scoped grant alive: a köşk is not above a medrese", () => {
    const codes = held(
      courseFacts({ medrese: true }),
      [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)],
      []
    );
    expect(codes.has(P.MADRASAH_BAN)).toBe(false);
    const viaKosk = held(
      courseFacts({ medrese: true }),
      [role(ASSIGNED_ROLES.MEDRESE_NAZIR, kosk())],
      [grant(madrasah(), [P.MADRASAH_BAN])]
    );
    expect(viaKosk.has(P.MADRASAH_BAN)).toBe(false);
  });

  it("a grant stored at the platform for a course code is not honoured: the code is not held there", () => {
    const codes = held(
      courseFacts(),
      [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)],
      [grant(platform, [P.COURSE_EDIT])]
    );
    expect(codes.has(P.COURSE_EDIT)).toBe(false);
  });

  it("a grant at another course is not held in this one", () => {
    const codes = held(
      courseFacts(),
      [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
      [grant(course(OTHER_COURSE), [P.COURSE_EDIT])]
    );
    expect(codes.has(P.COURSE_EDIT)).toBe(false);
  });

  it("a grant that carries a code no grant may carry is ignored", () => {
    const codes = held(
      courseFacts(),
      [role(ASSIGNED_ROLES.KOSK_NAZIM, kosk())],
      [grant(kosk(), [P.PERMISSION_GRANT])]
    );
    // The role's own default is the only way to hold it.
    expect(
      held(
        courseFacts(),
        [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
        [grant(course(), [P.PERMISSION_GRANT, P.COURSE_HIDE])]
      ).has(P.PERMISSION_GRANT)
    ).toBe(false);
    expect(
      held(
        courseFacts(),
        [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
        [grant(course(), [P.COURSE_HIDE])]
      ).has(P.COURSE_HIDE)
    ).toBe(false);
    expect(codes.has(P.PERMISSION_GRANT)).toBe(true);
  });

  it("a role or a grant that ends exactly now is no longer held", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(
      effectivePermissions(
        courseFacts(),
        [role(ASSIGNED_ROLES.MUDERRIS, course(), now)],
        [],
        now
      ).codes.has(P.COURSE_EDIT)
    ).toBe(false);
    expect(
      effectivePermissions(
        courseFacts(),
        [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
        [grant(course(), [P.COURSE_EDIT], null, now)],
        now
      ).codes.has(P.COURSE_EDIT)
    ).toBe(false);
    expect(
      effectivePermissions(
        courseFacts(),
        [role(ASSIGNED_ROLES.MUDERRIS, course(), new Date(now.getTime() + 1))],
        [],
        now
      ).codes.has(P.COURSE_EDIT)
    ).toBe(true);
  });

  it("a köşk-scoped grant of the medrese's work does not count in a medrese course, and does in a köşk's own", () => {
    const grants = [grant(kosk(), [P.COURSE_OPEN_STANDALONE])];
    const roles = [role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform)];
    expect(
      held(courseFacts({ medrese: true }), roles, grants).has(
        P.COURSE_OPEN_STANDALONE
      )
    ).toBe(false);
    expect(
      held(courseFacts(), roles, grants).has(P.COURSE_OPEN_STANDALONE)
    ).toBe(true);
  });

  it("a public deck may be viewed and a private one created, and never managed, by any caller", () => {
    const codes = relationCodes(ENTITIES.FLASHCARD_DECK, RELATIONS.PUBLIC);
    expect(codes).toEqual([P.DECK_VIEW, P.DECK_CREATE_PRIVATE]);
    for (const code of [
      P.DECK_MANAGE_CARDS,
      P.DECK_MANAGE_PRIVATE,
      P.DECK_CREATE_CARD,
    ]) {
      expect(codes, code).not.toContain(code);
    }
  });
});
