import { AuthzResolverError } from "../../src";
import { PinoLogger } from "../../src/logger/pino.logger";

const pinoError = vi.fn();

// The real pino starts a pino-pretty worker thread; only the call matters here.
vi.mock("pino", () => ({
  default: () => ({ error: pinoError, info: vi.fn(), warn: vi.fn() }),
}));

describe("PinoLogger.error (MDRS-220)", () => {
  beforeEach(() => pinoError.mockClear());

  it("keeps a wrapped error's cause, code and context in the log line", () => {
    const sql = 'Failed query: select "id" from "madrasahs"';
    const thrown = new AuthzResolverError(
      "@Authz(view) resolver failed",
      { scope: "view" },
      { cause: new Error(sql) }
    );

    new PinoLogger().error("AUTHZ_RESOLVER_ERROR [id]", thrown);

    const [data, message] = pinoError.mock.calls[0];
    expect(message).toBe("AUTHZ_RESOLVER_ERROR [id]");
    expect(data.error).toMatchObject({
      name: "AuthzResolverError",
      message: "@Authz(view) resolver failed",
      code: "AUTHZ_RESOLVER_ERROR",
      context: { scope: "view" },
      stack: expect.any(String),
      cause: { name: "Error", message: sql, stack: expect.any(String) },
    });
  });

  it("stops following causes after a few levels", () => {
    let error = new Error("innermost");
    for (let i = 0; i < 20; i++)
      error = new Error(`level ${i}`, { cause: error });

    new PinoLogger().error("deep", error);

    let depth = 0;
    let node = pinoError.mock.calls[0][0].error;
    while (node.cause) {
      node = node.cause;
      depth++;
    }
    expect(depth).toBeLessThan(10);
    expect(node).not.toHaveProperty("stack");
  });

  it("still logs a non-Error value as it is", () => {
    new PinoLogger().error("odd", { reason: "x" });

    expect(pinoError.mock.calls[0][0].error).toEqual({ reason: "x" });
  });
});
