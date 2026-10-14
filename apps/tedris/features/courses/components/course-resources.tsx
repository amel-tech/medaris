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
 * A row: the icon, the words and, when it is linked, the trailing icon. A
 * linked row is one block (MDRS-248): the whole row is the link, framed like
 * a control and lit on hover, because talebeler pressed the trailing icon,
 * which was not part of the link, and nothing downloaded. A row that is not
 * linked keeps the same layout without the frame, so it does not look
 * pressable.
 */
const ROW = "flex items-center gap-3 px-3 py-3";
const LINKED_ROW = `${ROW} rounded-control border border-neutral-subtle text-neutral-default no-underline transition-colors hover:bg-neutral-hover`;

/**
 * The rows of a list of resources (MDRS-279, design tedris/05 "Bu kursun
 * kaynakları"): each a name, an optional short line and either the address
 * it opens in a new tab or, since MDRS-287, a file it downloads. Both are
 * content: without `view_details` the API leaves them out and the name is
 * listed alone. Only an http(s) address is linked, whatever the API sent, so
 * a stored `javascript:` can never become an href; a file is linked only to
 * this app's own download route, which adds the token on the server and
 * hands back an attachment, and carries its type and size under its name.
 * The link has no `download` attribute: the attachment saves the file, and a
 * refusal comes back to the page with `?fileError=` (or goes to sign-in),
 * which a `download` link would save as the file instead. A
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
    className={`m-0 flex list-none flex-col gap-2 p-0${className ? ` ${className}` : ""}`}
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
        const body = (
          <>
            <Icon name={fileIcon(file.contentType)} size="sm" />
            <span className="flex min-inline-0 flex-1 flex-col">
              {name}
              {download ? (
                <span className="mds-visually-hidden">{labels.download}</span>
              ) : null}
              {meta}
              <span className="flex flex-wrap items-center gap-2 mbs-1">
                {type ? <Badge variant="secondary">{type}</Badge> : null}
                <span className="mds-caption mds-num">
                  {formatFileSize(file.sizeBytes, locale)}
                </span>
              </span>
            </span>
          </>
        );
        return (
          <li key={resource.id}>
            {download ? (
              <a className={LINKED_ROW} href={download}>
                {body}
                <Icon name="download" size="sm" />
              </a>
            ) : (
              <div className={ROW}>{body}</div>
            )}
          </li>
        );
      }
      const href = resourceHref(resource.url);
      const provider = resourceProviderOf(href);
      const body = (
        <>
          <Icon name={ICONS[resource.type ?? ""] ?? "link"} size="sm" />
          <span className="flex min-inline-0 flex-1 flex-col">
            {name}
            {href ? (
              <span className="mds-visually-hidden">{labels.newTab}</span>
            ) : null}
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
        </>
      );
      return (
        <li key={resource.id}>
          {href ? (
            <a
              className={LINKED_ROW}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {body}
              <Icon name="externalLink" size="sm" />
            </a>
          ) : (
            <div className={ROW}>{body}</div>
          )}
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
