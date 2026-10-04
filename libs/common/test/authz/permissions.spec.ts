import {
  ASSIGNED_ROLES,
  ENTITIES,
  GRANTABLE_CODES,
  isPermissionCode,
  LISTED_CODES,
  PERMISSION_META,
  PERMISSIONS,
  POLICY_CLOSES,
  POLICY_KEYS,
  RELATION_CODES,
  RELATIONS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_SCOPE_TYPES,
  relationCodes,
  roleCodesAt,
  SCOPE_TYPES,
} from "../../src";

const codes = Object.values(PERMISSIONS);

describe("permission catalogue (MDRS-135 §1)", () => {
  it("has metadata for every code, and codes are unique dotted strings", () => {
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(PERMISSION_META[code]).toBeDefined();
      expect(isPermissionCode(code)).toBe(true);
    }
    expect(isPermissionCode("kosk.nothing")).toBe(false);
  });

  it("tags every listed code with a scope type, and no implicit code with one", () => {
    for (const code of codes) {
      const meta = PERMISSION_META[code];
      if (meta.implicit) {
        expect(meta.scopes, code).toEqual([]);
        expect(meta.grantable, code).toBe(false);
      } else {
        expect(meta.scopes.length, code).toBeGreaterThan(0);
      }
    }
  });

  it("never lets 'grant permissions' be handed on, and draws it on no screen", () => {
    expect(PERMISSION_META[PERMISSIONS.PERMISSION_GRANT]).toMatchObject({
      grantable: false,
      unlisted: true,
    });
    expect(GRANTABLE_CODES.has(PERMISSIONS.PERMISSION_GRANT)).toBe(false);
    expect(LISTED_CODES).not.toContain(PERMISSIONS.PERMISSION_GRANT);
    expect(
      roleCodesAt(ASSIGNED_ROLES.MUDERRIS, SCOPE_TYPES.COURSE)
    ).not.toContain(PERMISSIONS.PERMISSION_GRANT);
    // Every other listed code can be handed on.
    for (const code of LISTED_CODES) {
      expect(GRANTABLE_CODES.has(code), code).toBe(true);
    }
  });

  it("derived abilities ride on a listed permission", () => {
    for (const code of codes) {
      const from = PERMISSION_META[code].derivedFrom;
      if (from) expect(LISTED_CODES).toContain(from);
    }
    for (const key of Object.values(POLICY_KEYS)) {
      for (const closed of POLICY_CLOSES[key]) {
        expect(PERMISSION_META[closed].derivedFrom).toBeDefined();
      }
    }
  });
});

describe("role defaults (MDRS-135 §3)", () => {
  // Every code tagged for one of the scope types, the unlisted one included:
  // the defaults are the roles' own, whatever a screen draws.
  const tagged = (...types: string[]) =>
    codes.filter((code) =>
      PERMISSION_META[code].scopes.some((scope) => types.includes(scope))
    );

  it("gives a köşk nazımı every köşk- and course-scoped permission and nothing else", () => {
    expect([...ROLE_DEFAULT_PERMISSIONS.KOSK_NAZIM].sort()).toEqual(
      [...tagged("kosk", "course")].sort()
    );
    expect(ROLE_DEFAULT_PERMISSIONS.KOSK_NAZIM).not.toContain(
      PERMISSIONS.MADRASAH_COURSE_OPEN
    );
    expect(ROLE_DEFAULT_PERMISSIONS.KOSK_NAZIM).not.toContain(
      PERMISSIONS.PLATFORM_KOSK_EDIT
    );
  });

  it("gives a başmüderris every medrese- and course-scoped permission and nothing else", () => {
    expect([...ROLE_DEFAULT_PERMISSIONS.MEDRESE_BASMUDERRIS].sort()).toEqual(
      [...tagged("madrasah", "course")].sort()
    );
    expect(ROLE_DEFAULT_PERMISSIONS.MEDRESE_BASMUDERRIS).toContain(
      PERMISSIONS.MADRASAH_COURSE_OPEN
    );
    expect(ROLE_DEFAULT_PERMISSIONS.MEDRESE_BASMUDERRIS).not.toContain(
      PERMISSIONS.KOSK_MANAGE
    );
  });

  it("gives a müderris every course-scoped permission and nothing else", () => {
    expect([...ROLE_DEFAULT_PERMISSIONS.MUDERRIS].sort()).toEqual(
      [...tagged("course")].sort()
    );
  });

  it("gives the Medaris nazımı, the medrese nazırı and the ders nazırı nothing", () => {
    expect(ROLE_DEFAULT_PERMISSIONS.MEDARIS_NAZIM).toEqual([]);
    expect(ROLE_DEFAULT_PERMISSIONS.MEDRESE_NAZIR).toEqual([]);
    expect(ROLE_DEFAULT_PERMISSIONS.DERS_NAZIR).toEqual([]);
  });

  it("keeps the permission to hand permissions on to the roles that may", () => {
    for (const role of [
      ASSIGNED_ROLES.KOSK_NAZIM,
      ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      ASSIGNED_ROLES.MUDERRIS,
    ]) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).toContain(
        PERMISSIONS.PERMISSION_GRANT
      );
    }
    for (const role of [
      ASSIGNED_ROLES.MEDARIS_NAZIM,
      ASSIGNED_ROLES.MEDRESE_NAZIR,
      ASSIGNED_ROLES.DERS_NAZIR,
    ]) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain(
        PERMISSIONS.PERMISSION_GRANT
      );
    }
  });

  it("keeps the medrese's own work out of the köşk nazımı's hands", () => {
    // Opening a course and choosing its müderrisler is one permission of the
    // köşk's ("Medrese dışı ders aç; müderrisleri ve imamı seç"), and it does
    // not reach a course held for a medrese.
    expect(PERMISSION_META[PERMISSIONS.COURSE_OPEN_STANDALONE]).toMatchObject({
      scopes: [SCOPE_TYPES.KOSK],
      notInMadrasahCourse: true,
    });
    // Hiding is the köşk's own (and the medrese's), so a köşk nazımı keeps it.
    expect(
      PERMISSION_META[PERMISSIONS.COURSE_HIDE].notInMadrasahCourse
    ).toBeUndefined();
  });

  it("puts each role in exactly one kind of scope", () => {
    expect(ROLE_SCOPE_TYPES.KOSK_NAZIM).toBe("kosk");
    expect(ROLE_SCOPE_TYPES.MEDRESE_BASMUDERRIS).toBe("madrasah");
    expect(ROLE_SCOPE_TYPES.MUDERRIS).toBe("course");
    expect(ROLE_SCOPE_TYPES.MEDARIS_NAZIM).toBe("platform");
  });
});

describe("relationship codes (what the matrix rows that were not roles said)", () => {
  it("opens the course page to every signed-in caller and the content to the enrolled (MDRS-103)", () => {
    const publicCourse = relationCodes(ENTITIES.COURSE, RELATIONS.PUBLIC);
    expect(publicCourse).toEqual(
      expect.arrayContaining([
        PERMISSIONS.COURSE_VIEW,
        PERMISSIONS.COURSE_ENROLL,
      ])
    );
    expect(publicCourse).not.toContain(PERMISSIONS.COURSE_VIEW_DETAILS);
    const enrolled = relationCodes(ENTITIES.COURSE, RELATIONS.ENROLLED);
    expect(enrolled).toContain(PERMISSIONS.COURSE_VIEW_DETAILS);
    // Enrolled callers still hold what PUBLIC holds: a second enrolment.
    expect(enrolled).toContain(PERMISSIONS.COURSE_ENROLL);
    expect(relationCodes(ENTITIES.COURSE, RELATIONS.PENDING)).not.toContain(
      PERMISSIONS.COURSE_VIEW_DETAILS
    );
  });

  it("gives an anonymous caller the page and nothing else, with no PUBLIC inheritance (MDRS-45, MDRS-122)", () => {
    expect(relationCodes(ENTITIES.COURSE, RELATIONS.ANONYMOUS)).toEqual([
      PERMISSIONS.COURSE_VIEW,
    ]);
    expect(relationCodes(ENTITIES.KOSK, RELATIONS.ANONYMOUS)).toEqual([
      PERMISSIONS.KOSK_VIEW,
    ]);
    expect(relationCodes(ENTITIES.MADRASAH, RELATIONS.ANONYMOUS)).toEqual([
      PERMISSIONS.MADRASAH_VIEW,
    ]);
    expect(relationCodes(ENTITIES.FLASHCARD_DECK, RELATIONS.ANONYMOUS)).toEqual(
      [PERMISSIONS.DECK_VIEW]
    );
  });

  it("lets a deck's author manage it and any caller view and start a private deck", () => {
    expect(
      relationCodes(ENTITIES.FLASHCARD_DECK, RELATIONS.DECK_OWNER)
    ).toEqual(
      expect.arrayContaining([
        PERMISSIONS.DECK_MANAGE_PRIVATE,
        PERMISSIONS.DECK_MANAGE_CARDS,
        PERMISSIONS.DECK_CREATE_PRIVATE,
      ])
    );
    const anyone = relationCodes(ENTITIES.FLASHCARD_DECK, RELATIONS.PUBLIC);
    expect(anyone).toEqual(
      expect.arrayContaining([
        PERMISSIONS.DECK_VIEW,
        PERMISSIONS.DECK_CREATE_PRIVATE,
      ])
    );
    expect(anyone).not.toContain(PERMISSIONS.DECK_MANAGE_PRIVATE);
  });

  it("holds creating a köşk or a medrese and every real delete in no relationship (MDRS-124)", () => {
    const everything = Object.values(RELATION_CODES).flatMap((rows) =>
      Object.values(rows).flat()
    );
    for (const code of [
      PERMISSIONS.PLATFORM_KOSK_CREATE,
      PERMISSIONS.PLATFORM_MADRASAH_CREATE,
      PERMISSIONS.COURSE_DELETE,
      PERMISSIONS.KOSK_DELETE,
      PERMISSIONS.MADRASAH_DELETE,
    ]) {
      expect(everything).not.toContain(code);
    }
  });

  it("holds no delete in any role's defaults either", () => {
    for (const role of Object.values(ASSIGNED_ROLES)) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain(
        PERMISSIONS.COURSE_DELETE
      );
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain(
        PERMISSIONS.KOSK_DELETE
      );
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain(
        PERMISSIONS.MADRASAH_DELETE
      );
    }
  });
});
