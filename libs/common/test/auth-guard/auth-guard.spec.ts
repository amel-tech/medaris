import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AUTHZ_PUBLIC_KEY, AuthGuard, IJwtVerifier } from "../../src";

/**
 * MDRS-45. The one property that matters most here is the last describe
 * block: on a public handler, only an ABSENT header is anonymous. Every
 * header that is present is verified, so a bad token is a 401 and never
 * silently degrades into an anonymous request.
 */

const buildContext = (
  headers: Record<string, string>
): { ctx: ExecutionContext; request: Record<string, unknown> } => {
  const handler = function handler() {};
  const request: Record<string, unknown> = { headers };
  const ctx = {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
};

const reflector = (isPublic: boolean): Reflector =>
  ({
    get: (key: string) =>
      key === AUTHZ_PUBLIC_KEY && isPublic ? true : undefined,
  }) as unknown as Reflector;

const verifierAccepting = (): IJwtVerifier =>
  ({
    verifyToken: vi.fn().mockResolvedValue({ sub: "u-1" }),
  }) as unknown as IJwtVerifier;

const verifierRejecting = (): IJwtVerifier =>
  ({
    verifyToken: vi.fn().mockRejectedValue(new Error("jwt expired")),
  }) as unknown as IJwtVerifier;

describe("AuthGuard", () => {
  describe("on a handler without @AuthzPublic", () => {
    it("refuses a request with no Authorization header", async () => {
      const guard = new AuthGuard(verifierAccepting(), reflector(false));
      const { ctx } = buildContext({});
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it("attaches the verified token as request.user", async () => {
      const guard = new AuthGuard(verifierAccepting(), reflector(false));
      const { ctx, request } = buildContext({ authorization: "Bearer t" });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.user).toEqual({ sub: "u-1" });
    });
  });

  describe("on a handler marked @AuthzPublic (MDRS-45)", () => {
    it("lets a request with no Authorization header through, with no user", async () => {
      const verifier = verifierAccepting();
      const guard = new AuthGuard(verifier, reflector(true));
      const { ctx, request } = buildContext({});
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.user).toBeUndefined();
      expect(verifier.verifyToken).not.toHaveBeenCalled();
    });

    it("still verifies a token that is present, and attaches the user", async () => {
      const guard = new AuthGuard(verifierAccepting(), reflector(true));
      const { ctx, request } = buildContext({ authorization: "Bearer t" });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.user).toEqual({ sub: "u-1" });
    });

    it.each([
      ["an empty header", ""],
      ["a non-Bearer scheme", "Basic dXNlcjpwYXNz"],
      ["Bearer with no token", "Bearer"],
    ])("refuses %s instead of treating it as anonymous", async (_label, value) => {
      const guard = new AuthGuard(verifierAccepting(), reflector(true));
      const { ctx } = buildContext({ authorization: value });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it("refuses a token the verifier rejects (expired, badly signed) instead of treating it as anonymous", async () => {
      const guard = new AuthGuard(verifierRejecting(), reflector(true));
      const { ctx, request } = buildContext({ authorization: "Bearer t" });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(request.user).toBeUndefined();
    });
  });
});
