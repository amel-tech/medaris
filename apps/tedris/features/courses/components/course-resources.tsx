import { fileTypeChip, formatFileSize } from "@medaris/services/file-rules";
import type {
  ResourceFileResponse,
  ResourceResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Card } from "@medaris/ui/mds/card";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { resourceHref } from "@medaris/utils";
import { fileIcon, resourceFileHref } from "../file-model";
import { resourceProviderOf } from "../resource-provider";

const ICONS: Record<string, IconName> = {
  pdf: "pdf",
  doc: "doc",
  deck: "cards",
};

/**
 * One row of the list: a course's resource or, since MDRS-286, a celse's own
 * (`LessonResourceResponse`, which has no `type` and may send `meta: null`).
 * Since MDRS-287 a row may be a file in Medaris storage instead of a link:
 * `file` comes only to who may read the content, like `url`.
 */
export type ResourceRow = Pick<ResourceResponse, "id" | "name"> & {
  url?: string | null;
  meta?: string | null;
  type?: string;
  file?: ResourceFileResponse | null;
};

/** What a list of resources says besides the rows' own words. */
export interface ResourceListLabels {
  /** read after a link's name: " (yeni sekmede açılır)" */
  newTab: string;
  /** read after a file's name: " (indirilir)" */
  download: string;
}

/**
 * The rows of a list of resources (MDRS-279, design tedris/05 "Bu kursun
 * kaynakları"): each a name, an optional short line and either the address
 * it opens in a new tab or, since MDRS-287, a file it downloads. Both are
 * content: without `view_details` the API leaves them out and the name is
 * listed alone. Only an http(s) address is linked, whatever the API sent, so
 * a stored `javascript:` can never become an href; a file is linked only to
 * this app's own download route, which adds the token on the server and
 * hands back an attachment, and carries its type and size under its name. A
 * linked row on a host with a name of its own (Google Drive) says so with a
 * chip under its name, as a recording's provider does (MDRS-286). No hooks,
 * so the server celse detail page and the client course page draw the same
 * rows.
 */
export const ResourceList = ({
  resources,
  labels,
  locale,
  testId,
  className,
}: {
  resources: readonly ResourceRow[];
  labels: ResourceListLabels;
  /** the page's language, for a file's size */
  locale: string;
  /** the list's `data-testid`: the celse detail page tells its two apart */
  testId?: string;
  className?: string;
}) => (
  <ul
    className={`m-0 flex list-none flex-col p-0${className ? ` ${className}` : ""}`}
    data-testid={testId}
  >
    {resources.map((resource) => {
      const name = (
        <span className="mds-label" dir="auto">
          {resource.name}
        </span>
      );
      const meta = resource.meta ? (
        <span className="mds-caption" dir="auto">
          {resource.meta}
        </span>
      ) : null;
      const file = resource.file ?? null;
      if (file) {
        const download = resourceFileHref(file);
        const type = fileTypeChip(file.contentType);
        return (
          <li
            key={resource.id}
            className="flex items-center gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
          >
            <Icon name={fileIcon(file.contentType)} size="sm" />
            <span className="flex min-inline-0 flex-1 flex-col">
              {download ? (
                <a className="mds-link" href={download} download>
                  {name}
                  <span className="mds-visually-hidden">{labels.download}</span>
                </a>
              ) : (
                name
              )}
              {meta}
              <span className="flex flex-wrap items-center gap-2 mbs-1">
                {type ? <Badge variant="secondary">{type}</Badge> : null}
                <span className="mds-caption mds-num">
                  {formatFileSize(file.sizeBytes, locale)}
                </span>
              </span>
            </span>
            {download ? <Icon name="download" size="sm" /> : null}
          </li>
        );
      }
      const href = resourceHref(resource.url);
      const provider = resourceProviderOf(href);
      return (
        <li
          key={resource.id}
          className="flex items-center gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
        >
          <Icon name={ICONS[resource.type ?? ""] ?? "link"} size="sm" />
          <span className="flex min-inline-0 flex-1 flex-col">
            {href ? (
              <a
                className="mds-link"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {name}
                <span className="mds-visually-hidden">{labels.newTab}</span>
              </a>
            ) : (
              name
            )}
            {meta}
            {provider ? (
              // A provider, not a meeting: its name alone, no dot.
              <PlatformChip
                platform={provider}
                kind="recording"
                className="self-start mbs-1"
              />
            ) : null}
          </span>
          {href ? <Icon name="externalLink" size="sm" /> : null}
        </li>
      );
    })}
  </ul>
);

/**
 * A course's resources as the course page's card: the rows of
 * `ResourceList` under a title, and who opens them on a locked course;
 * nothing at all for a course without one. The celse detail page puts the
 * same rows in its own "Kaynaklar" card (MDRS-289).
 */
export const CourseResources = ({
  resources,
  labels,
  locale,
  locked = false,
}: {
  resources: readonly ResourceRow[] | undefined;
  labels: ResourceListLabels & {
    title: string;
    /** under the list of a locked course: who opens the resources */
    locked: string;
  };
  locale: string;
  /** the API answered `contentLocked`: the names come without addresses or files */
  locked?: boolean;
}) => {
  if (!resources || resources.length === 0) return null;
  return (
    <Card title={labels.title} headingLevel={2} data-testid="course-resources">
      <ResourceList
        resources={resources}
        labels={labels}
        locale={locale}
        className="mbs-4"
      />
      {locked ? <p className="mds-caption mbs-2">{labels.locked}</p> : null}
    </Card>
  );
};
