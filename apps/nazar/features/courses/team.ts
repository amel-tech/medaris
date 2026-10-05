import type { SetMadrasahCourseMuderrisDto } from "@medaris/services/tedrisat";

/**
 * The müderris list of a medrese course (nazir 08 and 17) as rules: who is on
 * it, who is the imam, and what may be added, removed or sent. Pure on purpose,
 * so the picker is a thin view over a reducer that is exercised without a DOM.
 */

/** The most müderrisler a course holds; the API refuses a longer list. */
export const MAX_MUDERRIS = 20;

/** One line of the list: an account, or a müderris shown by name alone. */
export interface Member {
  /** null for a müderris with no account behind the name: shown, never edited */
  userId: string | null;
  name: string;
  /** null until the person has signed in once */
  email: string | null;
  /** the API's flag; only read for a member with no account */
  isImam: boolean;
}

export interface Team {
  members: Member[];
  /** the account that is the imam; null until one is chosen */
  imam: string | null;
}

export type TeamAction =
  | { type: "add"; member: Member }
  | { type: "remove"; userId: string }
  | { type: "imam"; userId: string };

const same = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

/** The accounts on the list, in the order they are shown. */
export const accountsOf = (team: Team): string[] =>
  team.members.flatMap((member) => (member.userId ? [member.userId] : []));

export const isListed = (team: Team, userId: string): boolean =>
  accountsOf(team).some((id) => same(id, userId));

export const isFull = (team: Team): boolean =>
  team.members.length >= MAX_MUDERRIS;

/** Whether the row is the imam's: the chosen account, or a müderris with no account while none is chosen. */
export const isImam = (team: Team, member: Member): boolean =>
  member.userId
    ? team.imam !== null && same(team.imam, member.userId)
    : team.imam === null && member.isImam;

/**
 * A lone account is the imam; with several the imam is whoever was chosen, as
 * long as they are still listed; with none there is no imam.
 */
function settle(members: Member[], imam: string | null): Team {
  const accounts = accountsOf({ members, imam: null });
  const [only] = accounts;
  if (accounts.length === 1 && only) return { members, imam: only };
  const kept = imam && accounts.some((id) => same(id, imam)) ? imam : null;
  return { members, imam: kept };
}

/** The list a course starts from: what the API says, its imam among the accounts. */
export function teamOf(
  muderris: ReadonlyArray<Pick<Member, "userId" | "name" | "email" | "isImam">>
): Team {
  const members = muderris.map(({ userId, name, email, isImam }) => ({
    userId,
    name,
    email,
    isImam,
  }));
  const imam = muderris.find((m) => m.isImam && m.userId)?.userId ?? null;
  return settle(members, imam);
}

export function teamReducer(team: Team, action: TeamAction): Team {
  switch (action.type) {
    case "add": {
      const id = action.member.userId;
      if (!id || isListed(team, id) || isFull(team)) return team;
      return settle([...team.members, action.member], team.imam);
    }
    case "remove":
      return settle(
        team.members.filter(
          (member) => !(member.userId && same(member.userId, action.userId))
        ),
        team.imam
      );
    case "imam":
      return isListed(team, action.userId)
        ? settle(team.members, action.userId)
        : team;
  }
}

/**
 * Whether "Çıkar" is on. A course that exists keeps at least one account on
 * its list (the API refuses an empty one), so the last is held; a course still
 * being opened may empty its list and is told on "Dersi aç".
 */
export const canRemove = (team: Team, keepOne: boolean): boolean =>
  !keepOne || accountsOf(team).length > 1;

export type TeamProblem = "none" | "imam";

/** What keeps the list from being sent: no account on it, or several and no imam chosen. */
export function teamProblem(team: Team): TeamProblem | null {
  const accounts = accountsOf(team).length;
  if (accounts === 0) return "none";
  return accounts > 1 && team.imam === null ? "imam" : null;
}

/** The accounts and the imam as the API's two requests take them. */
export function teamRequest(team: Team): SetMadrasahCourseMuderrisDto {
  return {
    muderrisUserIds: accountsOf(team),
    ...(team.imam ? { imamUserId: team.imam } : {}),
  };
}

/** Whether the list differs from where it started: other accounts, another order, or another imam. */
export function teamChanged(from: Team, to: Team): boolean {
  const before = accountsOf(from);
  const after = accountsOf(to);
  return (
    before.length !== after.length ||
    before.some((id, index) => !same(id, after[index] ?? "")) ||
    (from.imam ?? "").toLowerCase() !== (to.imam ?? "").toLowerCase()
  );
}
