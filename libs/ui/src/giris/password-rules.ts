/**
 * The password rules the registration and reset screens list under the field
 * (canvas medaris/03 and medaris/07). Keycloak enforces the realm policy
 * (`length(10) and notEmail and notUsername`); this is the live preview that
 * lets a person see which rule is still open before the form is sent.
 */

export type PasswordRuleId = "length" | "notEmail" | "notUsername";

export interface PasswordRuleInput {
  password: string;
  /** the e-mail address typed so far, or the account's, when known */
  email?: string;
  /** the user name typed so far, or the account's, when known */
  username?: string;
  /** the realm's `length` policy; the canvas lists 10 */
  minLength?: number;
}

export const DEFAULT_PASSWORD_MIN_LENGTH = 10;

const same = (a: string, b: string | undefined) =>
  b !== undefined &&
  b.trim() !== "" &&
  a.toLowerCase() === b.trim().toLowerCase();

/**
 * Which rules the password meets. An empty password meets none: a tick on an
 * empty field would read as "done" to a screen reader before anything was typed.
 */
export function evaluatePasswordRules({
  password,
  email,
  username,
  minLength = DEFAULT_PASSWORD_MIN_LENGTH,
}: PasswordRuleInput): Record<PasswordRuleId, boolean> {
  const filled = password !== "";
  return {
    length: password.length >= minLength,
    notEmail: filled && !same(password, email),
    notUsername: filled && !same(password, username),
  };
}

/** What is wrong with a new password and its repeat, in the order the form reports it. */
export type PasswordProblem = "empty" | "tooShort" | "rules" | "mismatch";

export function passwordProblems(
  input: PasswordRuleInput & { confirm: string }
): { password?: PasswordProblem; confirm?: PasswordProblem } {
  const rules = evaluatePasswordRules(input);
  const problems: { password?: PasswordProblem; confirm?: PasswordProblem } =
    {};
  if (input.password === "") problems.password = "empty";
  else if (!rules.length) problems.password = "tooShort";
  else if (!rules.notEmail || !rules.notUsername) problems.password = "rules";
  if (input.confirm === "") problems.confirm = "empty";
  else if (input.confirm !== input.password) problems.confirm = "mismatch";
  return problems;
}
