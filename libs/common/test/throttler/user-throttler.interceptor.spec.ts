import { CallHandler, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Throttle, ThrottlerException } from "@nestjs/throttler";
import { buildUserThrottlerOptions } from "../../src/throttler/throttler.config";
import { MemoryThrottlerStorage } from "../../src/throttler/throttler-storage";
import { UserThrottlerInterceptor } from "../../src/throttler/user-throttler.interceptor";

/**
 * The per-user layer (2026-10-12). Every caller below arrives from the same
 * address, as every caller does in production behind the proxy and the web
 * servers; before this layer that address was the only key there was.
 */

const LIMIT = 2;
const ADDRESS = "10.0.0.1";

class DeckController {
  read() {}

  @Throttle({ user: { limit: 1, ttl: 60_000 } })
  importCards() {}

  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  feed() {}
}

const handlers = DeckController.prototype;

function call(handler: () => void, user?: { sub: string }) {
  const headers: Record<string, unknown> = {};
  const request = { ip: ADDRESS, headers: {}, user };
  const response = {
    header: (name: string, value: unknown) => {
      headers[name] = value;
    },
  };
  const context = {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => DeckController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

describe("UserThrottlerInterceptor", () => {
  let interceptor: UserThrottlerInterceptor;
  let next: CallHandler & { handle: ReturnType<typeof vi.fn> };

  const run = (handler: () => void, user?: { sub: string }) => {
    const { context, headers } = call(handler, user);
    return { done: interceptor.intercept(context, next), headers };
  };

  beforeEach(async () => {
    interceptor = new UserThrottlerInterceptor(
      buildUserThrottlerOptions({
        THROTTLE_USER_LIMIT: String(LIMIT),
      } as NodeJS.ProcessEnv),
      new MemoryThrottlerStorage(),
      new Reflector()
    );
    await interceptor.onModuleInit();
    next = { handle: vi.fn(() => "handled") } as unknown as typeof next;
  });

  it("refuses one user past the limit with a 429 and a Retry-After", async () => {
    for (let n = 0; n < LIMIT; n++) {
      await expect(run(handlers.read, { sub: "a" }).done).resolves.toBe(
        "handled"
      );
    }

    const refused = run(handlers.read, { sub: "a" });
    await expect(refused.done).rejects.toBeInstanceOf(ThrottlerException);
    expect(refused.headers["Retry-After"]).toBe(60);
    expect(next.handle).toHaveBeenCalledTimes(LIMIT);
  });

  it("keeps a second user on the same address in a budget of their own", async () => {
    for (let n = 0; n < LIMIT; n++) await run(handlers.read, { sub: "a" }).done;
    await expect(run(handlers.read, { sub: "a" }).done).rejects.toBeInstanceOf(
      ThrottlerException
    );

    await expect(run(handlers.read, { sub: "b" }).done).resolves.toBe(
      "handled"
    );
  });

  it("does not count a request without a user — the address layer does", async () => {
    for (let n = 0; n < LIMIT * 3; n++) {
      await expect(run(handlers.read).done).resolves.toBe("handled");
    }
  });

  it("applies a route's @Throttle({ user }) override", async () => {
    await run(handlers.importCards, { sub: "a" }).done;

    await expect(
      run(handlers.importCards, { sub: "a" }).done
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it("ignores a route's @Throttle({ default }) override, which is the address layer's", async () => {
    for (let n = 0; n < LIMIT; n++) {
      await expect(run(handlers.feed, { sub: "a" }).done).resolves.toBe(
        "handled"
      );
    }
  });
});
