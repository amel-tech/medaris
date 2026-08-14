import { defineConfig } from "drizzle-kit";
import { resolveDatabaseSsl } from "./src/config/database-ssl";
import { requireDbPassword } from "./src/config/security-env";

export default defineConfig({
  schema: "./src/database/schema/*",
  out: "./src/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USERNAME || "tedrisat",
    // Same requirement as the runtime pool rather than a fallback or a bare
    // `undefined`: the migration client authenticates against the same
    // database, so it must fail the same way instead of reaching for
    // docker/init-db.sql's password or connecting with no credential at all.
    password: requireDbPassword(),
    database: process.env.DB_NAME || "tedrisat_db",
    ssl: resolveDatabaseSsl(),
  },
});
