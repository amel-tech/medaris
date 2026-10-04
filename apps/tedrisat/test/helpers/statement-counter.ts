import { Client } from "pg";
import { vi } from "vitest";

/**
 * Counts the SQL statements a piece of work sends to Postgres (MDRS-46).
 *
 * The spy sits on `pg`'s `Client.prototype.query`, the one method every path
 * ends in: `Pool.query` checks a client out and calls `Client.query` on it,
 * and drizzle's transactions run `begin`, their statements and `commit`
 * through the same method. Spying `Pool.prototype.query` as well would count
 * a statement twice, which is why only this one is spied (the first spec that
 * uses it pins that, against a real connection).
 *
 * It counts what leaves the process, so it needs no hook in the code under
 * measurement, and it sees every statement whoever sent it: the authorization
 * loader, the repository, the audit write. The window is the process, not a
 * request: run one thing at a time, or the counts of two overlapping requests
 * mix.
 */
export interface RecordedStatements<T> {
  result: T;
  /** The text of each statement, in the order it was sent. */
  statements: string[];
}

export async function recordStatements<T>(
  run: () => Promise<T>
): Promise<RecordedStatements<T>> {
  const statements: string[] = [];
  const original = Client.prototype.query;
  const spy = vi
    .spyOn(Client.prototype, "query")
    // The spy forwards to the real method on purpose: the work must still
    // reach Postgres, or the app would answer from nothing and the count would
    // be of a different program.
    .mockImplementation(function (this: Client, ...args: unknown[]) {
      const first = args[0];
      statements.push(
        typeof first === "string"
          ? first
          : ((first as { text?: string } | undefined)?.text ?? "")
      );
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    } as never);
  try {
    const result = await run();
    return { result, statements };
  } finally {
    spy.mockRestore();
  }
}

/**
 * The statement with everything inside parentheses taken out, so what is left
 * is its own level: a subquery in the select list (`coalesce((select ... from
 * "role_assignments"), '{}')`) or a column list must not name the statement.
 * Quoted identifiers and string literals are copied through whole, because a
 * parenthesis inside one is not nesting.
 */
function outerLevel(text: string): string {
  let out = "";
  let depth = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === "'" || char === '"') {
      let end = at + 1;
      // A doubled quote is an escaped one, not the end.
      while (end < text.length) {
        if (text[end] === char) {
          if (text[end + 1] === char) {
            end += 2;
            continue;
          }
          break;
        }
        end++;
      }
      if (depth === 0) {
        out += text.slice(at, end + 1);
      }
      at = end;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += char;
    }
  }
  return out;
}

/**
 * A statement in a few words, for a table a person reads: its verb and the
 * first table its own level names (`select role_assignments`, `begin`), never
 * a subquery's. Not a parser; a statement it cannot place is shown as its verb
 * alone.
 */
export function describeStatement(text: string): string {
  const verb = /^\s*(?:with\b[\s\S]*?\)\s*)?(\w+)/i
    .exec(text)?.[1]
    ?.toLowerCase();
  const level = outerLevel(text);
  const table =
    /\b(?:from|into|update)\s+"([a-z_]+)"/i.exec(level)?.[1] ??
    /\bjoin\s+"([a-z_]+)"/i.exec(level)?.[1];
  return table ? `${verb ?? "?"} ${table}` : (verb ?? "?");
}

/** `describeStatement` of each statement, counted, most frequent first. */
export function summariseStatements(statements: string[]): string {
  const counts = new Map<string, number>();
  for (const text of statements) {
    const key = describeStatement(text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, n]) => (n > 1 ? `${key} x${n}` : key))
    .join(", ");
}
