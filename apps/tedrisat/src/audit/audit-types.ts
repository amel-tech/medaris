import { neutralizeFormula } from "@medaris/common";

/**
 * The "Ne yaptı" filter of the audit page (MDRS-181, nizam/17). A row stores
 * `<entity>.<verb>`; the page groups those into the kinds the design lists.
 * The grouping is data, so the SQL filter and the label of a row can never
 * disagree: both read this table.
 */
interface AuditTypeRule {
  /** `LIKE` patterns on `audit_log.action`; `%` matches any run. */
  like: readonly string[];
  /** Actions the patterns would catch that belong to an earlier kind. */
  unless?: readonly string[];
}

export const AUDIT_TYPE_RULES = {
  CONTENT_READ: { like: ["course.content_read"] },
  // Two acts, one kind: the nizam preview of a requested deck writes
  // `deck.private-read`, the başnazım's read through the deck routes writes
  // `deck.admin_read` (MDRS-148).
  PRIVATE_DECK_READ: { like: ["deck.private-read", "deck.admin_read"] },
  PERSONAL_DATA_READ: {
    like: ["kosk_application.contact_read", "course.roster_read"],
  },
  USER_LOOKUP: { like: ["user.lookup"] },
  TAKEOVER: { like: ["permission.take_over", "permission.drop"] },
  GRANT: { like: ["permission.%", "permission_group.%"] },
  ROLE_CHANGE: {
    like: [
      "medaris_nazim.%",
      "kosk.nazim.%",
      "madrasah_nazir.%",
      "madrasah.head_muderris.%",
      "course.muderris_update",
      "course_nazir.%",
      "inactive_scope.assign",
    ],
  },
  POLICY_CHANGE: { like: ["platform_policy.%", "kosk.policy_change"] },
  BAN: { like: ["ban.%"] },
  HIDE: {
    like: ["%.hide", "%.restore", "deck.unpublish"],
  },
  HOSTING: { like: ["hosting_right.%"] },
  APPEAL: { like: ["appeal.%"] },
  PERMANENT_BAN: { like: ["permanent_ban.%"] },
  PERMANENT_DELETE: {
    like: ["%.delete"],
    unless: ["permission_group.delete"],
  },
  EXPORT: { like: ["audit.export"] },
} as const satisfies Record<string, AuditTypeRule>;

/** What a row is when no kind claims it; the page lists it only under "Tümü". */
export const AUDIT_OTHER = "OTHER" as const;

export const AUDIT_TYPES = [
  ...(Object.keys(AUDIT_TYPE_RULES) as (keyof typeof AUDIT_TYPE_RULES)[]),
  AUDIT_OTHER,
] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];

const likeToRegExp = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`
  );

/**
 * The kinds that overlap by design are resolved in this order: the first rule
 * to claim the action wins, exactly as the SQL filter's exclusions say.
 */
const ORDER = Object.keys(
  AUDIT_TYPE_RULES
) as (keyof typeof AUDIT_TYPE_RULES)[];

const COMPILED = ORDER.map((type) => {
  const rule: AuditTypeRule = AUDIT_TYPE_RULES[type];
  return {
    type,
    like: rule.like.map(likeToRegExp),
    unless: new Set(rule.unless ?? []),
  };
});

/** The kind of one stored action. */
export function auditTypeOf(action: string): AuditType {
  for (const rule of COMPILED) {
    if (rule.unless.has(action)) continue;
    if (rule.like.some((re) => re.test(action))) return rule.type;
  }
  return AUDIT_OTHER;
}

/** The `LIKE` patterns and exclusions of a kind, for the SQL filter. */
export function auditTypeRule(type: Exclude<AuditType, "OTHER">): {
  like: readonly string[];
  unless: readonly string[];
} {
  const rule: AuditTypeRule = AUDIT_TYPE_RULES[type];
  return { like: rule.like, unless: rule.unless ?? [] };
}

export const AUDIT_SCOPE_KINDS = ["PLATFORM", "KOSK", "MADRASAH"] as const;
export type AuditScopeKind = (typeof AUDIT_SCOPE_KINDS)[number];

/** One CSV cell: quoted when needed, and defanged when it could run as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  // A spreadsheet runs a text cell that starts with `=`, `+`, `-`, `@` as a formula (MDRS-36).
  const text =
    typeof value === "string" ? neutralizeFormula(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADER = [
  "no",
  "time",
  "actor",
  "actor_role",
  "type",
  "action",
  "scope_kind",
  "scope_name",
] as const;

export interface CsvRow {
  number: number;
  createdAt: Date;
  actorName: string | null;
  actorRole: string | null;
  type: string;
  action: string;
  scopeKind: string;
  scopeName: string | null;
}

export function auditCsv(rows: readonly CsvRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.number,
        r.createdAt.toISOString(),
        r.actorName,
        r.actorRole,
        r.type,
        r.action,
        r.scopeKind,
        r.scopeName,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
