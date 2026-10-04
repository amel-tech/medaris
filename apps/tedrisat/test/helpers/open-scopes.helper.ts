import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { users } from "../../src/database/schema/user.schema";
import { asSystemAdmin } from "./system-admin.helper";
import { TEST_USER_ID } from "./test-app.helper";

/**
 * MDRS-136: a köşk is opened together with its nazımları and a course together
 * with its müderrisler, and both are accounts that have signed in (a `users`
 * row). Before it, the specs opened a köşk by `POST /kosks` as the admin and
 * relied on the caller becoming its nazım, and opened courses with no
 * müderris. These are the two fixtures they use now.
 */

/**
 * The müderris of every course a spec opens through `POST /kosks/:id/courses`
 * with no team of its own: not TEST_USER_ID (the köşk's nazım), so a spec that
 * counts who teaches a course is not disturbed by the nazım teaching it too.
 */
export const FIXTURE_MUDERRIS_ID = "7a1d5e0c-3b8f-4a52-9c6e-0d2f4b9a1e73";

/** The team body a course opened with no team of its own gets. */
export const FIXTURE_TEAM = [
  { userId: FIXTURE_MUDERRIS_ID, name: "Müderris Hilmi" },
];

/** Gives each id a `users` row, as a sign-in does (MDRS-104). */
export async function seedAccounts(
  app: INestApplication,
  ids: readonly string[]
): Promise<void> {
  await app
    .get(DatabaseService)
    .db.insert(users)
    .values(ids.map((id) => ({ id })))
    .onConflictDoNothing();
}

/**
 * `POST /kosks` as the başnazım, answering the response once it is as
 * expected (201 unless `status` says otherwise). The köşk is opened for
 * `managerUserIds` (default TEST_USER_ID, who therefore manages it as the specs
 * expect), whose accounts are seeded first together with the fixture müderris.
 * The admin signs with `as`, which the self-seat rule does not ask: give
 * another id to open the köşk for TEST_USER_ID from someone else.
 */
export async function openKosk(
  adminApp: INestApplication,
  body: Record<string, unknown> = {},
  options: { as?: string; status?: number } = {}
): Promise<request.Response> {
  const managerUserIds = (body.managerUserIds as string[] | undefined) ?? [
    TEST_USER_ID,
  ];
  await seedAccounts(adminApp, [...managerUserIds, FIXTURE_MUDERRIS_ID]);
  return request(adminApp.getHttpServer())
    .post("/kosks")
    .set("Authorization", asSystemAdmin(options.as ?? TEST_USER_ID))
    .send({ name: "Süleymaniye Köşkü", managerUserIds, ...body })
    .expect(options.status ?? 201);
}
