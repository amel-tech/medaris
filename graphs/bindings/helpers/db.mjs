// The part of sql.mjs that other helpers use too: SQL in, lines of JSON out, through psql inside the stack's Postgres container.
// Not a command. See sql.mjs for what comes back and how the database is reached.
import { spawn } from "node:child_process";
import { env, Fail } from "./lib.mjs";

const CONTAINER =
  process.env.MEDARIS_DB_CONTAINER ?? "medaris-graphs-medaris-db-1";

/** The statements of a script, comments dropped, each with a `shape` that has the insides of quotes blanked for looking at keywords. */
function statements(sql) {
  const out = [];
  let cur = "";
  let shape = "";
  const push = () => {
    if (shape.trim())
      out.push({ text: cur.trim(), shape: shape.toLowerCase() });
    cur = "";
    shape = "";
  };
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") {
      const e = sql.indexOf("\n", i);
      i = e < 0 ? n : e;
      cur += " ";
      shape += " ";
    } else if (c === "/" && d === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      cur += " ";
      shape += " ";
    } else if (c === "'" || c === '"') {
      const escapes = c === "'" && /(^|[^\w$])[eE]$/.test(cur);
      let j = i + 1;
      while (j < n) {
        if (escapes && sql[j] === "\\") j += 2;
        else if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2;
          else break;
        } else j++;
      }
      if (j >= n) throw new Fail("the SQL has a quote that is never closed", 2);
      cur += sql.slice(i, j + 1);
      shape += `${c}${" ".repeat(j - i - 1)}${c}`;
      i = j + 1;
    } else if (c === "$" && !/[\w$]/.test(cur.slice(-1))) {
      const tag = /^\$([A-Za-z_\u0080-￿][\w\u0080-￿]*)?\$/.exec(sql.slice(i));
      if (!tag) {
        cur += c;
        shape += c;
        i++;
      } else {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        if (end < 0)
          throw new Fail("the SQL has a dollar quote that is never closed", 2);
        const stop = end + tag[0].length;
        cur += sql.slice(i, stop);
        shape += " ".repeat(stop - i);
        i = stop;
      }
    } else if (c === ";") {
      push();
      i++;
    } else {
      cur += c;
      shape += c;
      i++;
    }
  }
  push();
  return out;
}

/** What to send psql for one statement, so that every row it gives back is a line of JSON. */
function wrap({ text, shape }) {
  const first = /^\s*(\w+)/.exec(shape)?.[1];
  const hasDml = /\b(insert|update|delete|merge)\b/.test(shape);
  if (
    first === "select" ||
    first === "values" ||
    first === "table" ||
    (first === "with" && !hasDml)
  )
    return `select row_to_json(_row) from (${text}) _row;`;
  if (first === "insert" || first === "update" || first === "delete")
    return /\breturning\b/.test(shape)
      ? `with _cte as (${text}) select row_to_json(_cte) from _cte;`
      : `with _cte as (${text} returning 1) select row_to_json(_n) from (select count(*) as rows from _cte) _n;`;
  if (first === "with") return `${text};`;
  return `${text};\nselect row_to_json(_ok) from (select true as ok) _ok;`;
}

/** Runs the SQL (one or more statements, one transaction) and returns what psql printed: a line of JSON per row. */
export async function query(sql) {
  const parsed = statements(sql);
  if (!parsed.length) throw new Fail("there is no SQL to run", 2);
  const raw = env().E2E_DATABASE_URL;
  if (!raw)
    throw new Fail("graphs/.local/accounts.env has no E2E_DATABASE_URL");
  // psql gets the person, the password and the database as libpq environment variables, so no part of the URL is on any command
  // line (not even inside the container, where `ps` shows an argument). It connects over the container's own socket.
  const url = new URL(raw);
  const pg = {
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      "PGUSER",
      "-e",
      "PGPASSWORD",
      "-e",
      "PGDATABASE",
      CONTAINER,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "-f",
      "-",
    ],
    { env: { ...process.env, ...pg }, stdio: ["pipe", "pipe", "pipe"] }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.on("data", (b) => (stderr += b));
  child.stdin.on("error", () => {}); // psql may stop reading at its first error
  child.stdin.end(parsed.map(wrap).join("\n"));
  const status = await new Promise((resolve, reject) => {
    child.on("error", (e) =>
      reject(new Fail(`docker did not run: ${e.message}`))
    );
    child.on("close", resolve);
  });
  if (status !== 0) {
    const lines = stderr
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const said =
      lines.find((l) =>
        /ERROR|FATAL|No such container|Cannot connect/i.test(l)
      ) ??
      lines[0] ??
      `exit ${status}`;
    throw new Fail(said.replace(/^psql:<stdin>:\d+: /, ""));
  }
  return stdout;
}
