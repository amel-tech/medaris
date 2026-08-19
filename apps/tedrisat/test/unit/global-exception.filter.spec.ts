import {
  GlobalExceptionFilter,
  ValidationError as MedarisAppError,
  MedarisValidationPipe,
} from "@medaris/common";
import {
  ArgumentsHost,
  BadRequestException,
  LoggerService,
  NotFoundException,
} from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";

/**
 * MDRS-29 — the filter is the single place where a thrown value becomes an HTTP
 * body, so this spec pins what may and may not cross that boundary:
 *
 *   - an unexpected `Error` must leave nothing of itself in the response, while
 *     the server-side log keeps the original object (message and stack);
 *   - a `MedarisError` and an `HttpException` are authored for clients, so
 *     their messages survive untouched;
 *   - every branch emits a non-empty `code`.
 *
 * It lives here rather than in `libs/common` because that project declares no
 * `test` target.
 */

/** The exact shape of a leaked pg error, used as the negative assertion. */
const PG_ERROR_MESSAGE = 'relation "decks" does not exist';

function captureResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  return {
    host,
    status,
    get body() {
      return json.mock.calls[0]?.[0];
    },
    get statusCode() {
      return status.mock.calls[0]?.[0];
    },
  };
}

function stubLogger() {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService & { error: ReturnType<typeof vi.fn> };
}

describe("GlobalExceptionFilter", () => {
  describe("an unexpected Error (the fallback branch)", () => {
    it("returns a fixed body carrying neither the message nor a stack", () => {
      const logger = stubLogger();
      const res = captureResponse();

      new GlobalExceptionFilter(logger).catch(
        new Error(PG_ERROR_MESSAGE),
        res.host
      );

      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain(PG_ERROR_MESSAGE);
      expect(serialised).not.toContain('"decks"');
      expect(serialised).not.toContain("does not exist");
      expect(serialised).not.toContain("at ");
      expect(res.body).not.toHaveProperty("stack");

      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({
        type: "UNKNOWN_ERROR",
        code: "INTERNAL_ERROR",
        status: 500,
        message: "Internal server error",
      });
      expect(res.body.correlationId).toEqual(expect.any(String));
      expect(res.body.correlationId.length).toBeGreaterThan(0);
    });

    it("gives every response a distinct correlation id", () => {
      const logger = stubLogger();
      const first = captureResponse();
      const second = captureResponse();
      const filter = new GlobalExceptionFilter(logger);

      filter.catch(new Error(PG_ERROR_MESSAGE), first.host);
      filter.catch(new Error(PG_ERROR_MESSAGE), second.host);

      expect(first.body.correlationId).not.toBe(second.body.correlationId);
    });

    it("hands the original error object to the logger, with the correlation id", () => {
      const logger = stubLogger();
      const res = captureResponse();
      const thrown = new Error(PG_ERROR_MESSAGE);

      new GlobalExceptionFilter(logger).catch(thrown, res.host);

      const [message, passed] = logger.error.mock.calls[0];
      expect(passed).toBe(thrown);
      expect((passed as Error).message).toBe(PG_ERROR_MESSAGE);
      expect((passed as Error).stack).toBeDefined();
      expect(message).toContain(res.body.correlationId);
    });

    it("does not stringify a non-Error throw into the body either", () => {
      const logger = stubLogger();
      const res = captureResponse();

      new GlobalExceptionFilter(logger).catch(
        { secret: "s3nt1nel-throw" },
        res.host
      );

      expect(JSON.stringify(res.body)).not.toContain("s3nt1nel-throw");
      expect(res.body.message).toBe("Internal server error");
    });
  });

  describe("errors authored for clients", () => {
    it("keeps a MedarisError body exactly as before", () => {
      const logger = stubLogger();
      const res = captureResponse();
      const error = new MedarisAppError("Köşk bulunamadı", { koskId: "abc" });

      new GlobalExceptionFilter(logger).catch(error, res.host);

      expect(res.statusCode).toBe(error.status);
      expect(res.body).toEqual({
        type: "APP_ERROR",
        code: error.code,
        status: error.status,
        message: "Köşk bulunamadı",
        context: { koskId: "abc" },
        timestamp: expect.any(String),
      });
      expect(res.body.code).toBeTruthy();
    });

    it("keeps an HttpException message and status, and adds a stable code", () => {
      const logger = stubLogger();
      const res = captureResponse();

      new GlobalExceptionFilter(logger).catch(
        new NotFoundException("Kayıt bulunamadı"),
        res.host
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({
        type: "HTTP_ERROR",
        code: "HTTP_404",
        status: 404,
        message: "Kayıt bulunamadı",
        timestamp: expect.any(String),
      });
    });

    it("keeps a 400 HttpException message", () => {
      const logger = stubLogger();
      const res = captureResponse();

      new GlobalExceptionFilter(logger).catch(
        new BadRequestException("handle zaten kullanımda"),
        res.host
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        type: "HTTP_ERROR",
        code: "HTTP_400",
        status: 400,
        message: "handle zaten kullanımda",
      });
    });
  });

  it("emits a non-empty code on all three branches", () => {
    const logger = stubLogger();
    const codes = [
      new MedarisAppError("yok"),
      new NotFoundException("yok"),
      new Error(PG_ERROR_MESSAGE),
    ].map((thrown) => {
      const res = captureResponse();
      new GlobalExceptionFilter(logger).catch(thrown, res.host);
      return res.body.code;
    });

    for (const code of codes) {
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });
});

class SentinelDto {
  @IsString()
  @MaxLength(8)
  password!: string;
}

/**
 * The pipe feeds `context` straight into the APP_ERROR body, so the rejected
 * value must never reach it. Asserted end to end — pipe throws, filter
 * serialises — rather than on the pipe alone.
 */
describe("MedarisValidationPipe + GlobalExceptionFilter", () => {
  const SENTINEL = "s3nt1nel-hunter2-password";

  it("never echoes the rejected value back to the client", async () => {
    const pipe = new MedarisValidationPipe();
    const logger = stubLogger();
    const res = captureResponse();

    let thrown: unknown;
    try {
      await pipe.transform(
        { password: SENTINEL },
        { type: "body", metatype: SentinelDto }
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    new GlobalExceptionFilter(logger).catch(thrown, res.host);

    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(res.body.context.errors[0]).toHaveProperty("property", "password");
    expect(res.body.context.errors[0]).toHaveProperty("constraints");
    expect(res.body.context.errors[0]).not.toHaveProperty("value");
  });
});
