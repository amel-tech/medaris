/**
 * What saving nizam/12 changes (MDRS-171), as plain data: which held grants
 * stay, which go, which get a new end and which codes and group are new. Pure
 * on purpose, so the rule is pinned without a database. Rows that stay keep
 * their id, their giver and their date: opening the dialog and saving it
 * unchanged touches nothing.
 */
export interface IHeldGrant {
  id: string;
  permission: string | null;
  groupId: string | null;
  expiresAt: Date | null;
}

export interface IWantedGrants {
  /** The platform group, or null for none. */
  groupId: string | null;
  /** The permissions given on top of the group. */
  permissions: readonly string[];
  /** When every row ends; null for never. */
  expiresAt: Date | null;
}

export interface IGrantPlan {
  revoke: string[];
  /** Kept rows whose end is not the wanted one. */
  retime: string[];
  insert: Array<{ permission: string } | { groupId: string }>;
}

const sameInstant = (a: Date | null, b: Date | null) =>
  (a === null && b === null) ||
  (a !== null && b !== null && a.getTime() === b.getTime());

/**
 * Codes the group already carries are dropped from the extras: "the group's
 * permissions are ticked and cannot be removed one by one", so a request that
 * lists them again means nothing new.
 */
export function extrasBeyondGroup(
  permissions: readonly string[],
  groupPermissions: readonly string[]
): string[] {
  const inGroup = new Set(groupPermissions);
  return [...new Set(permissions)].filter((code) => !inGroup.has(code));
}

export function planGrants(
  held: readonly IHeldGrant[],
  wanted: IWantedGrants
): IGrantPlan {
  const plan: IGrantPlan = { revoke: [], retime: [], insert: [] };
  const wantedCodes = new Set(wanted.permissions);
  const keptCodes = new Set<string>();
  let keptGroup = false;

  for (const row of held) {
    let keep = false;
    if (row.groupId !== null) {
      keep = row.groupId === wanted.groupId && !keptGroup;
      if (keep) keptGroup = true;
    } else if (row.permission !== null) {
      keep = wantedCodes.has(row.permission) && !keptCodes.has(row.permission);
      if (keep) keptCodes.add(row.permission);
    }
    if (!keep) {
      plan.revoke.push(row.id);
    } else if (!sameInstant(row.expiresAt, wanted.expiresAt)) {
      plan.retime.push(row.id);
    }
  }

  if (wanted.groupId !== null && !keptGroup) {
    plan.insert.push({ groupId: wanted.groupId });
  }
  for (const code of wantedCodes) {
    if (!keptCodes.has(code)) plan.insert.push({ permission: code });
  }
  return plan;
}

/**
 * The rows of one scope, by code or group: for each, the one that runs longest
 * (no end beats any end; on a tie, the oldest) leads, and the others ride
 * along with it. A code can be held twice when a kept row was given more time
 * by someone whose holding sits below the row's authority
 * (`MadrasahNazirRepository.setPermissions`).
 */
export function longestRunning<
  T extends {
    id: string;
    permission: string | null;
    groupId: string | null;
    expiresAt: Date | null;
  },
>(rows: readonly T[]): { leads: T[]; ridersOf: Map<string, T[]> } {
  const itemOf = (row: T) =>
    row.groupId ? `group:${row.groupId}` : `code:${row.permission}`;
  const runsLonger = (a: T, b: T) =>
    a.expiresAt === null
      ? b.expiresAt !== null
      : b.expiresAt !== null && a.expiresAt > b.expiresAt;
  const lead = new Map<string, T>();
  const riding = new Map<string, T[]>();
  for (const row of rows) {
    const item = itemOf(row);
    const current = lead.get(item);
    if (!current) {
      lead.set(item, row);
      riding.set(item, []);
    } else if (runsLonger(row, current)) {
      riding.get(item)?.push(current);
      lead.set(item, row);
    } else {
      riding.get(item)?.push(row);
    }
  }
  const leads = rows.filter((row) => lead.get(itemOf(row)) === row);
  const ridersOf = new Map<string, T[]>();
  for (const [item, row] of lead) ridersOf.set(row.id, riding.get(item) ?? []);
  return { leads, ridersOf };
}

/**
 * The end a grant may have, or why not: after now, and never past the
 * appointment it hangs on. `null` for "no end of its own", which the caller
 * turns into the appointment's end.
 */
export function checkGrantExpiry(
  expiresAt: Date | null,
  assignmentExpiresAt: Date | null,
  now: Date
): "past" | "after-assignment" | null {
  if (expiresAt === null) return null;
  if (expiresAt.getTime() <= now.getTime()) return "past";
  if (
    assignmentExpiresAt !== null &&
    expiresAt.getTime() > assignmentExpiresAt.getTime()
  ) {
    return "after-assignment";
  }
  return null;
}

/**
 * The earliest end among the dates given; null when none of them ends. What
 * the "Bitiş" column shows for a person.
 */
export function earliestEnd(
  dates: ReadonlyArray<Date | null | undefined>
): Date | null {
  let best: Date | null = null;
  for (const date of dates) {
    if (date && (best === null || date.getTime() < best.getTime())) best = date;
  }
  return best;
}
