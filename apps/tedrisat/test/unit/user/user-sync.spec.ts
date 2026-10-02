import { UserIdentity } from "../../../src/user/interfaces/token-claims.interface";
import {
  LAST_SEEN_REFRESH_HOURS,
  UserRepository,
} from "../../../src/user/user.repository";
import { identityFromClaims } from "../../../src/user/user-identity";
import { UserSyncService } from "../../../src/user/user-sync.service";

const SUB = "a0000000-0000-4000-8000-00000000000a";
const HOUR = 60 * 60 * 1000;

function identity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    id: SUB,
    email: "talebe@example.com",
    emailVerified: true,
    givenName: "Talha",
    familyName: "Talebe",
    locale: null,
    ...overrides,
  };
}

function serviceWithSpy() {
  const upsert = vi.fn().mockResolvedValue(undefined);
  const repo = { upsert } as unknown as UserRepository;
  return { service: new UserSyncService(repo), upsert };
}

describe("UserSyncService (MDRS-104)", () => {
  it("writes the first time a user is seen", async () => {
    const { service, upsert } = serviceWithSpy();
    await service.sync(identity(), 0);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("skips an unchanged user inside the refresh window", async () => {
    const { service, upsert } = serviceWithSpy();
    await service.sync(identity(), 0);
    await service.sync(identity(), (LAST_SEEN_REFRESH_HOURS * HOUR) / 2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("writes again once the refresh window has passed", async () => {
    const { service, upsert } = serviceWithSpy();
    await service.sync(identity(), 0);
    await service.sync(identity(), LAST_SEEN_REFRESH_HOURS * HOUR);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("writes at once when the e-mail changes", async () => {
    const { service, upsert } = serviceWithSpy();
    await service.sync(identity(), 0);
    await service.sync(identity({ email: "yeni@example.com" }), 1);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failed write, so the next request retries", async () => {
    const { service, upsert } = serviceWithSpy();
    upsert.mockRejectedValueOnce(new Error("connection reset"));
    await expect(service.sync(identity(), 0)).rejects.toThrow();
    await service.sync(identity(), 1);
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});

describe("identityFromClaims (MDRS-104)", () => {
  it("normalises the claims it copies", () => {
    expect(
      identityFromClaims({
        sub: SUB.toUpperCase(),
        email: "  talebe@example.com ",
        email_verified: "true",
        given_name: "",
        family_name: 42,
        locale: "tr",
      })
    ).toEqual({
      id: SUB,
      email: "talebe@example.com",
      // Only a real boolean `true` counts as verified.
      emailVerified: false,
      givenName: null,
      familyName: null,
      locale: "tr",
    });
  });

  it("skips a subject that is not a UUID", () => {
    expect(identityFromClaims({ sub: "f:ldap:1234" })).toBeNull();
  });

  it("skips a request with no user", () => {
    expect(identityFromClaims(undefined)).toBeNull();
  });
});
