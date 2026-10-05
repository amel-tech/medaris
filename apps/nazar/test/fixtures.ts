import type { AssignmentResponse } from "@medaris/services/tedrisat";

/** An assignment as `GET /me/assignments` sends it; a spec overrides what it is about. */
export const assignment = (
  over: Partial<Record<keyof AssignmentResponse, unknown>> = {}
): AssignmentResponse =>
  ({
    id: "a-1",
    role: "MUDERRIS",
    scopeType: "course",
    scopeId: "c-1",
    scopeName: "Bina ve İzhar Şerhi",
    isImam: false,
    grantedAt: new Date("2026-09-01T09:00:00Z"),
    expiresAt: null,
    grantedBy: { id: "u-1", displayName: "Yusuf Ziya Ertuğrul" },
    grantedBySelf: false,
    ...over,
  }) as unknown as AssignmentResponse;

export const course = (over: Record<string, unknown> = {}) => ({
  status: "PUBLISHED",
  hidden: false,
  koskId: "k-1",
  koskName: "Nûruosmaniye Köşkü",
  madrasahId: null,
  madrasahName: null,
  studentCount: 35,
  ...over,
});

export const medrese = (over: Record<string, unknown> = {}) =>
  assignment({
    id: "a-m",
    role: "MEDRESE_BASMUDERRIS",
    scopeType: "madrasah",
    scopeId: "m-1",
    scopeName: "Süleymaniye Medresesi",
    ...over,
  });
