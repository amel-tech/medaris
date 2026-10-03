import { ROLES } from "@medaris/common";
import { bearerFor } from "./test-keycloak.helper";

/**
 * `Authorization` header for `sub` carrying the SYSTEM_ADMIN realm role.
 *
 * Opening a köşk is SYSTEM_ADMIN only since 2026-10-02, and the creator
 * becomes its owner and manager. A suite that seeds a köşk through
 * `POST /kosks` therefore signs that one request as an admin with the future
 * manager's own `sub`, and every other request keeps its ordinary identity —
 * the stubbed guard of `createTestApp({ authUserId })` sets no realm roles, so
 * such a suite sends this request through a second app on the real guard.
 */
export const asSystemAdmin = (sub: string): string =>
  bearerFor({
    sub,
    claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
  });
