/**
 * Reads the native e-mail theme in `src/email` (MDRS-100) — shared by the
 * static spec and the Keycloak e2e spec.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const EMAIL_THEME_DIR = join(__dirname, "../src/email");

export const EMAIL_LANGUAGES = ["en", "tr", "ar"] as const;

/**
 * Enough of java.util.Properties for these files: `key=value`, `#` comments
 * and `\n`. Anything else Properties would read differently — a `:`
 * separator, a line continuation, a `\u` escape — throws instead of being
 * misread, so the specs never compare text Keycloak would not send.
 */
export function readMessages(lang: string): Record<string, string> {
  const source = readFileSync(
    join(EMAIL_THEME_DIR, "messages", `messages_${lang}.properties`),
    "utf8"
  );
  const messages: Record<string, string> = {};
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0 || /\\(?!n)/.test(line)) {
      throw new Error(`messages_${lang}.properties: unsupported line: ${line}`);
    }
    messages[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .replace(/\\n/g, "\n");
  }
  return messages;
}

/** What java.text.MessageFormat makes of a message with string arguments. */
export function format(message: string, ...args: string[]): string {
  return message.replace(/\{(\d+)\}/g, (_, i: string) => args[Number(i)] ?? "");
}
