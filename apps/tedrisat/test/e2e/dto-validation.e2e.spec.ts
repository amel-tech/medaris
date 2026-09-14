import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { Scope } from "../../src/flashcard/domain/flashcard-label.enum";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";

/**
 * MDRS-57. `create-flashcard-label.dto.ts` and `create-flashcard-deck-label.dto.ts`
 * each imported half their decorators from `@nestjs/class-validator` and the
 * other half from `class-validator`, and every one of those constraints shipped
 * without a single test. Nothing in typecheck, lint or the suite distinguished
 * an enforced constraint from an ignored one, which is precisely how the mix
 * survived: the only way to tell is to send a violating body and look.
 *
 * So this file enumerates the constraints on both DTOs rather than sampling.
 * It is written to be run BEFORE the consolidation as well as after — that is
 * what makes it evidence that removing the fork changed no behaviour, instead
 * of a test written to agree with whatever the new code happens to do. Both
 * trees were run and both give the same result; see
 * docs/migration/mdrs-57-validation-consolidation.md §A4.
 *
 * Both bounds of each length constraint are pinned, because a rule that only
 * checks the rejecting side passes just as happily when the constraint is
 * absent and something else returns the 400.
 *
 * One constraint is deliberately NOT pinned: `@IsString()` sits behind
 * `@IsUUID()` on `labelId`, `flashcardId` and `deckId`, and no body can fail
 * the former without also failing the latter. It is unreachable by construction
 * rather than untested.
 *
 * This is a separate file, and a separate file costs a second Postgres
 * container boot (`fileParallelism: false`, one container per file). That is
 * accepted on purpose: these cases are about the DTOs, not about the label
 * controllers that `flashcard-label.e2e.spec.ts` covers, and folding them in
 * would tie validation coverage to that suite's fixtures.
 */

const NOT_A_UUID = "not-a-uuid";

// Deliberately real v4 values, version and variant nibbles included.
// `@IsUUID()` in class-validator 0.14 checks both, so the repeated-digit ids
// the older suites use for path params (`22222222-2222-…`) are rejected in a
// BODY while `ParseUUIDPipe` still accepts them in a PATH. That asymmetry is
// pre-existing and noted as a follow-up in the migration record; picking valid
// ids here keeps these cases about the constraint under test.
const SOME_UUID = "9f8b7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d";
const OTHER_UUID = "1a2b3c4d-5e6f-4718-9abc-def012345678";

describe("Label DTO validation (e2e)", () => {
  let app: INestApplication;
  let dbUtils: TestDatabaseUtils;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    dbUtils = new TestDatabaseUtils(app.get<DatabaseService>(DatabaseService));
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcard_labels", "deck_label");
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcard_labels", "deck_label");
    await app.close();
  });

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(path).send(body);

  // Both create routes carry the identical DTO shape, so the cases are shared
  // rather than copy-pasted — a divergence between the two would otherwise be
  // invisible here, which is how the original mix stayed unnoticed.
  describe.each([
    ["/flashcard-label/create", "CreateFlashcardLabelDto"],
    ["/flashcard-deck-label/create", "CreateFlashcardDeckLabelDto"],
  ])("%s — %s", (path) => {
    // @MinLength(5) and @MaxLength(100). Both came from the fork import.
    it("rejects a title shorter than 5 characters", async () => {
      const res = await post(path, { title: "abcd", scope: Scope.PERSONAL });
      expect(res.status).toBe(400);
    });

    it("accepts a title of exactly 5 characters", async () => {
      const res = await post(path, { title: "abcde", scope: Scope.PERSONAL });
      expect(res.status).toBe(201);
    });

    it("rejects a title longer than 100 characters", async () => {
      const res = await post(path, {
        title: "a".repeat(101),
        scope: Scope.PERSONAL,
      });
      expect(res.status).toBe(400);
    });

    it("accepts a title of exactly 100 characters", async () => {
      const res = await post(path, {
        title: "a".repeat(100),
        scope: Scope.PERSONAL,
      });
      expect(res.status).toBe(201);
    });

    // @IsString(). A number is the case that matters: without the constraint
    // it reaches the repository and the column takes it.
    it("rejects a non-string title", async () => {
      const res = await post(path, { title: 12345, scope: Scope.PERSONAL });
      expect(res.status).toBe(400);
    });

    // @IsEnum(Scope), also from the fork import.
    it("rejects a scope outside the enum", async () => {
      const res = await post(path, { title: "Kelime Hazinesi", scope: "TEAM" });
      expect(res.status).toBe(400);
    });

    it("accepts both enum members", async () => {
      const personal = await post(path, {
        title: "Kelime Hazinesi",
        scope: Scope.PERSONAL,
      });
      const shared = await post(path, {
        title: "Seviye A1 Kelimeleri",
        scope: Scope.PUBLIC,
      });
      expect(personal.status).toBe(201);
      expect(shared.status).toBe(201);
    });

    it("rejects a missing title", async () => {
      const res = await post(path, { scope: Scope.PERSONAL });
      expect(res.status).toBe(400);
    });

    it("rejects a missing scope", async () => {
      const res = await post(path, { title: "Kelime Hazinesi" });
      expect(res.status).toBe(400);
    });
  });

  /**
   * The labeling DTOs are where the two packages met inside a single FIELD:
   * `labelId` carried `@IsUUID()` from one and `@IsString()` from the other.
   *
   * These cases assert 400 only. A well-formed labeling body would have to
   * reference rows that exist, and seeding them proves nothing about the
   * validator — the question here is strictly whether the pipe rejects the body
   * before the handler ever runs.
   */
  describe.each([
    ["/flashcard-label/labeling", "flashcardId"],
    ["/flashcard-deck-label/labeling", "deckId"],
  ])("%s", (path, targetField) => {
    const body = (overrides: Record<string, unknown> = {}) => ({
      labelId: SOME_UUID,
      [targetField]: OTHER_UUID,
      ...overrides,
    });

    it("rejects a non-UUID labelId", async () => {
      const res = await post(path, body({ labelId: NOT_A_UUID }));
      expect(res.status).toBe(400);
    });

    it(`rejects a non-UUID ${targetField}`, async () => {
      const res = await post(path, body({ [targetField]: NOT_A_UUID }));
      expect(res.status).toBe(400);
    });

    it("rejects a numeric labelId", async () => {
      const res = await post(path, body({ labelId: 42 }));
      expect(res.status).toBe(400);
    });

    // The mirror field carries the identical `@IsUUID() @IsString()` pair, so it
    // gets the identical cases. Covering only `labelId` would leave a real
    // asymmetry invisible.
    it(`rejects a numeric ${targetField}`, async () => {
      const res = await post(path, body({ [targetField]: 42 }));
      expect(res.status).toBe(400);
    });

    it(`rejects a missing ${targetField}`, async () => {
      const res = await post(path, { labelId: SOME_UUID });
      expect(res.status).toBe(400);
    });

    // @IsOptional() @IsUUID() — optional means "may be absent", not "may be
    // anything". A present-but-malformed value must still be rejected.
    it("rejects a present but non-UUID privateToUserId", async () => {
      const res = await post(path, body({ privateToUserId: NOT_A_UUID }));
      expect(res.status).toBe(400);
    });

    // The other half of @IsOptional(): a well-formed body must clear the pipe,
    // whether the field is absent or present-and-valid.
    //
    // These two assert `not 400` rather than a success code on purpose. The
    // referenced label and target rows do not exist, so the handler goes on to
    // violate `flashcard_label_stats.label_id` and the response is a 500 — a
    // pre-existing error-handling wart that is not what these cases are about.
    // Pinning that 500 would make the suite fail the day somebody fixes it.
    //
    // Neither case is tautological: drop `@IsOptional()` and the default `null`
    // fails `@IsUUID()`, which turns both into the 400 they assert against.
    it("does not reject an omitted privateToUserId", async () => {
      const res = await post(path, body());
      expect(res.status).not.toBe(400);
    });

    it("does not reject a well-formed privateToUserId", async () => {
      const res = await post(path, body({ privateToUserId: OTHER_UUID }));
      expect(res.status).not.toBe(400);
    });

    it("rejects a missing labelId", async () => {
      const res = await post(path, { [targetField]: OTHER_UUID });
      expect(res.status).toBe(400);
    });
  });
});
