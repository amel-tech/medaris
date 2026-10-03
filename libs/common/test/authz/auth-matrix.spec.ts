import { ENTITIES, MATRIX, ROLES, SCOPES } from "../../src";

describe("auth-matrix structural invariants", () => {
  it("every entity has at least one entry", () => {
    const empty = Object.values(ENTITIES).filter(
      (entity) => Object.keys(MATRIX[entity] ?? {}).length === 0
    );
    expect(empty).toEqual([]);
  });

  it("every scope referenced in the matrix is a declared scope", () => {
    const validScopes = new Set<string>(Object.values(SCOPES));
    const bad: Array<{ entity: string; role: string; scope: string }> = [];
    for (const entity of Object.values(ENTITIES)) {
      const rows = MATRIX[entity] ?? {};
      for (const role of Object.keys(rows)) {
        for (const scope of rows[role as keyof typeof rows] ?? []) {
          if (!validScopes.has(scope)) {
            bad.push({ entity, role, scope });
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every role used in the matrix is a declared role", () => {
    const validRoles = new Set<string>(Object.values(ROLES));
    const bad: Array<{ entity: string; role: string }> = [];
    for (const entity of Object.values(ENTITIES)) {
      const rows = MATRIX[entity] ?? {};
      for (const role of Object.keys(rows)) {
        if (!validRoles.has(role)) {
          bad.push({ entity, role });
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("SYSTEM_ADMIN is never listed in any matrix row — bypass is the only path", () => {
    const leaks: Array<{ entity: string }> = [];
    for (const entity of Object.values(ENTITIES)) {
      const rows = MATRIX[entity] ?? {};
      if (ROLES.SYSTEM_ADMIN in rows) {
        leaks.push({ entity });
      }
    }
    expect(leaks).toEqual([]);
  });

  it("flashcard-deck PUBLIC grants view (anyone authenticated can see public decks)", () => {
    expect(
      MATRIX[ENTITIES.FLASHCARD_DECK][ROLES.PUBLIC]?.includes(SCOPES.VIEW)
    ).toBe(true);
  });

  it("flashcard-deck PUBLIC grants create_private_deck (anyone can create their own)", () => {
    expect(
      MATRIX[ENTITIES.FLASHCARD_DECK][ROLES.PUBLIC]?.includes(
        SCOPES.CREATE_PRIVATE_DECK
      )
    ).toBe(true);
  });

  it("flashcard-deck PUBLIC does NOT grant manage scopes (gate stays SYSTEM_ADMIN-only)", () => {
    const pubScopes = MATRIX[ENTITIES.FLASHCARD_DECK][ROLES.PUBLIC] ?? [];
    expect(pubScopes).not.toContain(SCOPES.MANAGE_PRIVATE_DECK);
    expect(pubScopes).not.toContain(SCOPES.MANAGE_FLASHCARDS);
  });

  it("flashcard-deck ANONYMOUS grants view and nothing else (MDRS-45)", () => {
    expect(MATRIX[ENTITIES.FLASHCARD_DECK][ROLES.ANONYMOUS]).toEqual([
      SCOPES.VIEW,
    ]);
  });

  // MDRS-122 opened köşk, medrese and course pages to callers with no token.
  // Reading is all any of them may do: no ENROLL, no DONATE, no create scope,
  // and nothing from the PUBLIC row is inherited (see `canAnonymous`).
  it("ANONYMOUS rows: deck, köşk, medrese and course, each VIEW and nothing else (MDRS-45, MDRS-122)", () => {
    const withAnonymous = Object.entries(MATRIX)
      .filter(([, rows]) => rows[ROLES.ANONYMOUS] !== undefined)
      .map(([entity, rows]) => [entity, rows[ROLES.ANONYMOUS]]);
    expect(Object.fromEntries(withAnonymous)).toEqual({
      [ENTITIES.COURSE]: [SCOPES.VIEW],
      [ENTITIES.KOSK]: [SCOPES.VIEW],
      [ENTITIES.MADRASAH]: [SCOPES.VIEW],
      [ENTITIES.FLASHCARD_DECK]: [SCOPES.VIEW],
    });
  });

  it("ijazah has no ANONYMOUS row (MDRS-122 opened intro pages only)", () => {
    expect(MATRIX[ENTITIES.IJAZAH][ROLES.ANONYMOUS]).toBeUndefined();
  });

  it("course PUBLIC grants view and enroll — the page is public, the content is not (MDRS-103)", () => {
    expect(MATRIX[ENTITIES.COURSE][ROLES.PUBLIC]).toEqual([
      SCOPES.VIEW,
      SCOPES.ENROLL,
    ]);
  });

  // MDRS-103: lesson content is VIEW_DETAILS. PENDING and PUBLIC must not
  // reach it, whatever else they are given.
  it("course content (VIEW_DETAILS, JOIN_LIVE_LESSON) is for enrolled, müderris and köşk manager only", () => {
    for (const scope of [SCOPES.VIEW_DETAILS, SCOPES.JOIN_LIVE_LESSON]) {
      const granting = Object.entries(MATRIX[ENTITIES.COURSE] ?? {})
        .filter(([, scopes]) => scopes?.includes(scope))
        .map(([role]) => role)
        .sort();
      expect(granting).toEqual(
        [ROLES.ENROLLED, ROLES.KOSK_MANAGER, ROLES.MUDERRIS].sort()
      );
    }
  });

  // MDRS-103: the session-level write responses (`LessonMutationResponse`,
  // the batch result) carry full lessons without a content filter, which is
  // sound only while everyone who may write a course may also read it.
  it("every course role that may EDIT may also VIEW_DETAILS", () => {
    const editorsWithoutContent = Object.entries(MATRIX[ENTITIES.COURSE] ?? {})
      .filter(
        ([, scopes]) =>
          scopes?.includes(SCOPES.EDIT) && !scopes.includes(SCOPES.VIEW_DETAILS)
      )
      .map(([role]) => role);
    expect(editorsWithoutContent).toEqual([]);
  });

  it("kosk PUBLIC grants view only — CREATE_KOSK is SYSTEM_ADMIN-only", () => {
    expect(MATRIX[ENTITIES.KOSK][ROLES.PUBLIC]).toEqual([SCOPES.VIEW]);
  });

  it("CREATE_KOSK is intentionally absent from every kosk matrix row", () => {
    const koskRows = MATRIX[ENTITIES.KOSK] ?? {};
    const rolesWithCreate = Object.entries(koskRows)
      .filter(([, scopes]) => scopes?.includes(SCOPES.CREATE_KOSK))
      .map(([role]) => role);
    expect(rolesWithCreate).toEqual([]);
  });

  it("madrasah PUBLIC grants view and donate (plan §4.4)", () => {
    expect(MATRIX[ENTITIES.MADRASAH][ROLES.PUBLIC]).toEqual([
      SCOPES.VIEW,
      SCOPES.DONATE,
    ]);
  });

  // MDRS-106 / MDRS-124: only SYSTEM_ADMIN deletes a medrese or creates one.
  it("no madrasah row grants DELETE or CREATE_MADRASAH", () => {
    const rows = Object.entries(MATRIX[ENTITIES.MADRASAH] ?? {});
    const granting = rows
      .filter(
        ([, scopes]) =>
          scopes?.includes(SCOPES.DELETE) ||
          scopes?.includes(SCOPES.CREATE_MADRASAH)
      )
      .map(([role]) => role);
    expect(granting).toEqual([]);
  });

  // MDRS-124: nobody but SYSTEM_ADMIN deletes anything; the people who run
  // things hide instead. Checked over every entity, so a new row cannot
  // quietly bring DELETE back.
  it("no role row on any entity grants DELETE", () => {
    const granting = Object.entries(MATRIX).flatMap(([entity, rows]) =>
      Object.entries(rows ?? {})
        .filter(([, scopes]) => scopes?.includes(SCOPES.DELETE))
        .map(([role]) => `${entity}:${role}`)
    );
    expect(granting).toEqual([]);
  });

  it("only the köşk manager may hide or restore a course", () => {
    const granting = Object.entries(MATRIX[ENTITIES.COURSE] ?? {})
      .filter(([, scopes]) => scopes?.includes(SCOPES.ARCHIVE))
      .map(([role]) => role);
    expect(granting).toEqual([ROLES.KOSK_MANAGER]);
  });

  // MDRS-126: a nazır who could add köşk managers could add themselves, and
  // a köşk manager is KOSK_MANAGER on every course of the köşk.
  it("only the köşk manager may add or remove köşk managers", () => {
    const granting = Object.entries(MATRIX).flatMap(([entity, rows]) =>
      Object.entries(rows ?? {})
        .filter(([, scopes]) => scopes?.includes(SCOPES.MANAGE_KOSK_MANAGERS))
        .map(([role]) => `${entity}:${role}`)
    );
    expect(granting).toEqual([`${ENTITIES.KOSK}:${ROLES.KOSK_MANAGER}`]);
  });

  it("a medrese's nazır holds nothing on a köşk (MDRS-134)", () => {
    expect(MATRIX[ENTITIES.KOSK][ROLES.MADRASAH_NAZIR]).toBeUndefined();
  });
});
