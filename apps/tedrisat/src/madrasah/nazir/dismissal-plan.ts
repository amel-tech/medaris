import type { DismissAction } from "../../assignment/admin/dto/permission-admin.dto";

/** One role or permission grant a nazır handed on, and who received it. */
export interface IGivenItem {
  kind: "ROLE" | "GRANT";
  id: string;
  userId: string;
}

export interface IDismissalPlan {
  takeOver: IGivenItem[];
  drop: IGivenItem[];
}

/**
 * What görevden al (nazir/15) does with each thing the nazır handed on, as
 * plain data. The decisions are per person — the dialog has one row, one
 * Devral/Düşür choice, for each — and must name every person who received
 * something, once, and nobody else. Null when they do not: the dismissal then
 * writes nothing.
 */
export function planDismissal(
  given: readonly IGivenItem[],
  decisions: ReadonlyArray<{ userId: string; action: DismissAction }>
): IDismissalPlan | null {
  const recipients = new Set(given.map((g) => g.userId));
  const decided = new Map(
    decisions.map((d) => [d.userId.toLowerCase(), d.action])
  );
  const complete =
    decided.size === decisions.length &&
    decided.size === recipients.size &&
    [...recipients].every((id) => decided.has(id));
  if (!complete) return null;

  return {
    takeOver: given.filter((g) => decided.get(g.userId) === "TAKE_OVER"),
    drop: given.filter((g) => decided.get(g.userId) === "DROP"),
  };
}
