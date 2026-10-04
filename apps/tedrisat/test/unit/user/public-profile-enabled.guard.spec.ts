import { ConfigService } from "@nestjs/config";
import { PublicProfileUnavailableError } from "../../../src/user/errors/public-profile-unavailable.error";
import { PublicProfileEnabledGuard } from "../../../src/user/public-profile-enabled.guard";

const guardWith = (enabled: unknown) =>
  new PublicProfileEnabledGuard({
    get: (key: string) =>
      key === "publicProfile.enabled" ? enabled : undefined,
  } as unknown as ConfigService);

const refusal = (guard: PublicProfileEnabledGuard): unknown => {
  try {
    guard.canActivate();
  } catch (error) {
    return error;
  }
  return null;
};

describe("PublicProfileEnabledGuard (MDRS-141)", () => {
  it("lets the request through only while the switch is true", () => {
    expect(guardWith(true).canActivate()).toBe(true);
  });

  it.each([
    ["false", false],
    ["unset", undefined],
    ["the string 'true'", "true"],
  ])("answers 404 PUBLIC_PROFILE_UNAVAILABLE when the switch is %s", (_, value) => {
    const error = refusal(guardWith(value));
    expect(error).toBeInstanceOf(PublicProfileUnavailableError);
    expect((error as PublicProfileUnavailableError).status).toBe(404);
    expect((error as PublicProfileUnavailableError).code).toBe(
      "PUBLIC_PROFILE_UNAVAILABLE"
    );
  });
});
