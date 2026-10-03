import {
  AUTHZ_EXEMPT_KEY,
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  AuthzGuard,
  type AuthzMeta,
} from "@medaris/common";
import {
  type INestApplication,
  RequestMethod,
  type Type,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import { createTestApp } from "../helpers/test-app.helper";

/**
 * The route-to-permission inventory (review T9): every HTTP handler of the API
 * with the catalogue codes it asks for, or the deliberate decision it carries
 * instead. With some hundred handlers re-keyed in MDRS-135, a widened `@Authz`
 * code on any of them failed nothing; now the change shows up as a line of this
 * file's snapshot in the diff, where a reviewer reads it.
 *
 * To accept a deliberate change: `vitest run -u` on this spec and read the diff
 * of `__snapshots__/authz-route-inventory.txt` like any other code.
 */
const anything = new Proxy({}, { get: () => "x" });
const fakeRequest = {
  params: anything,
  body: anything,
  query: anything,
  user: { sub: "x" },
} as never;
const fakeModules = {
  get: () => {
    throw new Error("no modules in the inventory");
  },
} as never;

/** The entity a sync resolver names (`byParam(...)`); a resolver that reads the database is named by its function. */
async function resolverOf(meta: AuthzMeta): Promise<string> {
  try {
    const result = await meta.resolve(fakeRequest, fakeModules);
    return result.entity;
  } catch {
    return meta.resolve.name || "custom";
  }
}

describe("the route inventory (review T9)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("matches the snapshot: which permissions guard which route", async () => {
    const discovery = app.get(DiscoveryService, { strict: false });
    const scanner = app.get(MetadataScanner, { strict: false });
    const rows: string[] = [];
    const guardsOn = (target: object): unknown[] => {
      const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
      return Array.isArray(guards) ? guards : [];
    };
    const isAuthz = (guard: unknown) =>
      guard === AuthzGuard || guard instanceof AuthzGuard;

    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype as Type<unknown> | null | undefined;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
      const guardedAtClass = guardsOn(controller).some(isAuthz);
      for (const method of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[method];
        if (typeof handler !== "function") continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler);
        const verb = Reflect.getMetadata(METHOD_METADATA, handler);
        if (path === undefined || verb === undefined) continue;
        const meta = Reflect.getMetadata(AUTHZ_KEY, handler) as
          | AuthzMeta
          | undefined;
        const guarded = guardedAtClass || guardsOn(handler).some(isAuthz);
        const isPublic =
          Reflect.getMetadata(AUTHZ_PUBLIC_KEY, handler) !== undefined;
        const exempt =
          Reflect.getMetadata(AUTHZ_EXEMPT_KEY, handler) !== undefined;
        let decision: string;
        if (meta) {
          const codes = (
            typeof meta.permission === "string"
              ? [meta.permission]
              : [...meta.permission]
          ).join(" | ");
          decision = `${codes} on ${await resolverOf(meta)}${isPublic ? " (public)" : ""}${guarded ? "" : " (NO AuthzGuard)"}`;
        } else if (isPublic) {
          decision = "public";
        } else if (exempt) {
          decision = "exempt";
        } else {
          decision = guarded ? "UNDECIDED" : "no AuthzGuard";
        }
        const full = `/${[base, String(path)]
          .map((part) => part.replace(/^\/+|\/+$/g, ""))
          .filter(Boolean)
          .join("/")}`;
        rows.push(`${RequestMethod[verb]} ${full} -> ${decision}`);
      }
    }
    rows.sort();
    await expect(`${rows.join("\n")}\n`).toMatchFileSnapshot(
      "./__snapshots__/authz-route-inventory.txt"
    );
    // The two shapes that must never appear: a route behind the guard with no
    // decision, and a decision with no guard to enforce it.
    expect(rows.filter((row) => /UNDECIDED|NO AuthzGuard/.test(row))).toEqual(
      []
    );
  });
});
