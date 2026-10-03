import type { ILogger } from "@medaris/common";
import type { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../../../src/database/database.service";
import { DEFAULT_MIGRATIONS_FOLDER } from "../../../src/database/migrations-folder";

/**
 * MDRS-219: what the boot does with the migrator. Both `pg` and the migrator
 * are replaced, so nothing here opens a socket — the point is the service's
 * own decisions: which folder it hands over, and whether a failure stops it.
 */
const { migrate, pool } = vi.hoisted(() => ({
  migrate: vi.fn(),
  pool: {
    on: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock("drizzle-orm/node-postgres/migrator", () => ({ migrate }));
vi.mock("pg", () => ({
  // A constructor, because the service calls `new Pool(...)`.
  Pool: vi.fn(function Pool() {
    return pool;
  }),
}));

function serviceWith(autoMigrations: unknown) {
  const logger = {
    setContext: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === "autoMigrations" ? (autoMigrations ?? fallback) : undefined,
  } as unknown as ConfigService;

  return {
    service: new DatabaseService(config, logger as unknown as ILogger),
    logger,
  };
}

describe("DatabaseService boot-time migrations (MDRS-219)", () => {
  beforeEach(() => {
    migrate.mockReset().mockResolvedValue(undefined);
    pool.on.mockReset();
    pool.query.mockReset().mockResolvedValue({ rows: [] });
    pool.end.mockReset().mockResolvedValue(undefined);
  });

  it("fails the boot when a migration fails, instead of serving the old schema", async () => {
    const failure = new Error("Can't find meta/_journal.json file");
    migrate.mockRejectedValue(failure);
    const { service, logger } = serviceWith({
      enabled: true,
      migrationsFolder: "/nowhere/migrations",
    });

    await expect(service.onModuleInit()).rejects.toBe(failure);

    expect(logger.error).toHaveBeenCalledWith(
      "Migrations from /nowhere/migrations failed",
      failure
    );
    // The boot stops at the migrator: the connection check never runs, and
    // the pool it opened is closed rather than left behind.
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("hands the migrator the configured folder", async () => {
    const { service } = serviceWith({
      enabled: true,
      migrationsFolder: "/srv/migrations",
    });

    await service.onModuleInit();

    expect(migrate).toHaveBeenCalledWith(expect.anything(), {
      migrationsFolder: "/srv/migrations",
    });
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("falls back to the folder beside the database module when none is configured", async () => {
    const { service } = serviceWith({ enabled: true, migrationsFolder: "" });

    await service.onModuleInit();

    expect(migrate).toHaveBeenCalledWith(expect.anything(), {
      migrationsFolder: DEFAULT_MIGRATIONS_FOLDER,
    });
  });

  it("does not migrate, and still boots, when auto migrations are disabled", async () => {
    const { service, logger } = serviceWith({
      enabled: false,
      migrationsFolder: "/srv/migrations",
    });

    await service.onModuleInit();

    expect(migrate).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith("Auto migrations are disabled");
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("treats a missing autoMigrations block as disabled", async () => {
    const { service } = serviceWith(undefined);

    await service.onModuleInit();

    expect(migrate).not.toHaveBeenCalled();
  });
});
