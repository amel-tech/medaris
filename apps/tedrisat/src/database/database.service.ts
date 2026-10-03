import { ILogger, LOGGER } from "@medaris/common";
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { DEFAULT_MIGRATIONS_FOLDER } from "./migrations-folder";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  public db!: NodePgDatabase<typeof schema>;

  constructor(
    private configService: ConfigService,
    @Inject(LOGGER) private readonly logger: ILogger
  ) {
    this.logger.setContext(DatabaseService.name);
  }

  async onModuleInit() {
    this.pool = new Pool({
      host: this.configService.get("database.host"),
      port: this.configService.get("database.port"),
      user: this.configService.get("database.username"),
      password: this.configService.get("database.password"),
      database: this.configService.get("database.database"),
      ssl: this.configService.get("database.ssl"),
    });

    // A migration that leaves a decision to a person says so in a NOTICE —
    // 0023 lists the courses it did not move into a medrese (MDRS-134).
    // node-postgres drops notices nobody listens for, so every connection
    // the pool opens hands them to the log. Only a plain `RAISE NOTICE`
    // (SQLSTATE 00000): the migrator's own "already exists, skipping" on
    // every boot carries a 42Pxx code and would bury the ones that matter.
    this.pool.on("connect", (client) => {
      client.on("notice", (notice) => {
        if (notice.code === "00000") {
          this.logger.warn(`Database notice: ${notice.message}`);
        }
      });
    });

    this.db = drizzle(this.pool, { schema });

    try {
      await this.migrateDatabase();
    } catch (error) {
      // A failed init hands the caller no application to close, so the pool
      // would otherwise outlive the boot that opened it.
      await this.pool.end();
      throw error;
    }

    // Test connection
    try {
      await this.pool.query("SELECT 1");
      this.logger.log("Database connected successfully");
    } catch (error) {
      this.logger.error("Database connection failed:", error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Runs the boot-time migrations, and stops the boot when they fail
   * (MDRS-219). Logging and carrying on served traffic against whatever
   * schema the database happened to have, and kept the deploy green while it
   * did: tedris-dev lacked every migration from 0014 on, and only a broken
   * page said so. A database the code does not match is not a state this
   * service can run in.
   */
  private async migrateDatabase() {
    const autoMigrations = this.configService.get<{
      enabled: boolean;
      migrationsFolder: string;
    }>("autoMigrations", { enabled: false, migrationsFolder: "" });

    const { enabled, migrationsFolder } = autoMigrations;

    if (!enabled) {
      this.logger.log("Auto migrations are disabled");
      return;
    }

    const resolvedFolder = migrationsFolder || DEFAULT_MIGRATIONS_FOLDER;
    this.logger.log(`Running migrations from ${resolvedFolder}`);

    try {
      await migrate(this.db, { migrationsFolder: resolvedFolder });
    } catch (error) {
      this.logger.error(`Migrations from ${resolvedFolder} failed`, error);
      throw error;
    }

    this.logger.log("Migrations completed successfully");
  }
}
