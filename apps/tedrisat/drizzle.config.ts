import { defineConfig } from "drizzle-kit";
import { resolveDatabaseSsl } from "./src/config/database-ssl";

export default defineConfig({
  schema: "./src/database/schema/*",
  out: "./src/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USERNAME || "tedrisat",
    // No fallback: the migration client authenticates against the same database
    // as the runtime pool, so it must not reach for docker/init-db.sql's
    // well-known password either.
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "tedrisat_db",
    ssl: resolveDatabaseSsl(),
  },
});
