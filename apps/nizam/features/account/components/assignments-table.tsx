"use client";

import { Badge, type BadgeVariant } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";

export interface AssignmentRow {
  id: string;
  role: string;
  isImam: boolean;
  scopeTitle: string | null;
  scopeBadge: { label: string; variant: BadgeVariant; hidden: boolean } | null;
  scopeMeta: string[];
  grantor: string;
  grantedAt: { label: string; iso: string } | null;
  expires: { label: string; iso: string | null };
}

export interface AssignmentsTableLabels {
  caption: string;
  imam: string;
  role: string;
  scope: string;
  grantor: string;
  expires: string;
}

/**
 * "Görevleriniz" (nizam 36, 47). The rows arrive already worded and dated by
 * the server so that the table has nothing to translate; the kit's `Table`
 * is a client component, which is the only reason this one is.
 */
export function AssignmentsTable({
  rows,
  labels,
}: {
  rows: AssignmentRow[];
  labels: AssignmentsTableLabels;
}) {
  const columns: TableColumn<AssignmentRow>[] = [
    {
      key: "role",
      header: labels.role,
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          <span data-testid="assignment-role">{row.role}</span>
          {row.isImam ? <Badge variant="secondary">{labels.imam}</Badge> : null}
        </span>
      ),
    },
    {
      key: "scope",
      header: labels.scope,
      render: (row) => (
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            {row.scopeTitle ? (
              <bdi data-testid="assignment-scope">{row.scopeTitle}</bdi>
            ) : null}
            {row.scopeBadge ? (
              <Badge
                variant={row.scopeBadge.variant}
                icon={
                  row.scopeBadge.hidden ? (
                    <Icon name="eyeOff" size="sm" />
                  ) : undefined
                }
              >
                {row.scopeBadge.label}
              </Badge>
            ) : null}
          </span>
          {row.scopeMeta.length > 0 ? (
            <span className="mds-caption">
              <bdi>{row.scopeMeta.join(" · ")}</bdi>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "grantor",
      header: labels.grantor,
      render: (row) => (
        <span>
          <bdi>{row.grantor}</bdi>
          {row.grantedAt ? (
            <>
              {" · "}
              <time dateTime={row.grantedAt.iso}>{row.grantedAt.label}</time>
            </>
          ) : null}
        </span>
      ),
    },
    {
      key: "expires",
      header: labels.expires,
      render: (row) =>
        row.expires.iso ? (
          <time dateTime={row.expires.iso}>{row.expires.label}</time>
        ) : (
          row.expires.label
        ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      caption={labels.caption}
      responsive="stack"
    />
  );
}
