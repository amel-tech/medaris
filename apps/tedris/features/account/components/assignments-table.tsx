"use client";

import { Badge, type BadgeVariant } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
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
  grantedAt: { label: string; iso: string };
  expires: { label: string; iso: string | null };
  action: { label: string; ariaLabel: string; href: string } | null;
}

export interface AssignmentsTableLabels {
  caption: string;
  imam: string;
  role: string;
  scope: string;
  grantor: string;
  expires: string;
  actions: string;
}

/**
 * "Görevlerin" (tedris 43). The rows arrive already worded and dated by the
 * server so that the table has nothing to translate; the kit's `Table` is a
 * client component, which is the only reason this one is.
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
        <span className="flex flex-wrap items-center gap-2">
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
        <span className="flex flex-col">
          <span>
            <bdi>{row.grantor}</bdi>
          </span>
          <time className="mds-caption" dateTime={row.grantedAt.iso}>
            {row.grantedAt.label}
          </time>
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
    {
      key: "actions",
      header: <span className="mds-visually-hidden">{labels.actions}</span>,
      align: "right",
      render: (row) =>
        row.action ? (
          <Button
            href={row.action.href}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="small"
            iconRight={<Icon name="externalLink" size="sm" />}
            aria-label={row.action.ariaLabel}
          >
            {row.action.label}
          </Button>
        ) : null,
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
