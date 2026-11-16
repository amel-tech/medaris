// SQL on tedrisat's database, inside the stack's Postgres container (medaris-graphs-medaris-db-1): for an `effects` check of a
// row a step wrote, and for setup data no API can make.
//
//   node helpers/sql.mjs "<sql>"        or  node helpers/sql.mjs @file.sql   or  ... | node helpers/sql.mjs -
//
// The database is the one in E2E_DATABASE_URL of graphs/.local/accounts.env. Its person, password and name reach psql through the
// environment of `docker exec` (`-e PGUSER`, `-e PGPASSWORD`, `-e PGDATABASE`: no value on any command line), and the SQL goes in
// on stdin. Nothing of the URL is printed.
//
// One line of JSON a row, so a binding's `expect` can match it:
//   select ...                       {"status":"PENDING"}, one line per row; nothing for no row
//   insert|update|delete ... returning ...   the returned rows
//   insert|update|delete ...         {"rows":1}, the number of rows it changed
//   anything else (DDL, ...)         {"ok":true}
// Several statements (separated by `;`) run in one transaction, in order, and stop at the first error with nothing kept.
// A WITH that holds an insert, update or delete is the one thing not turned into JSON: psql prints its rows as `a|b` text.
import { readFileSync } from "node:fs";
import { query } from "./db.mjs";
import { Fail, run } from "./lib.mjs";

run("sql", async () => {
  const args = process.argv.slice(2);
  if (args.length !== 1)
    throw new Fail('usage: sql.mjs "<sql>" | @file.sql | -', 2);
  const [arg] = args;
  const sql =
    arg === "-"
      ? readFileSync(0, "utf8")
      : arg.startsWith("@")
        ? readFileSync(arg.slice(1), "utf8")
        : arg;
  const stdout = await query(sql);
  process.stdout.write(stdout);
  if (!stdout.trim()) console.error("sql: no rows");
});
