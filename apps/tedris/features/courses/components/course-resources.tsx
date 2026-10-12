import type { ResourceResponse } from "@medaris/services/tedrisat";
import { Card } from "@medaris/ui/mds/card";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { resourceHref } from "@medaris/utils";
import { resourceProviderOf } from "../resource-provider";

const ICONS: Record<string, IconName> = {
  pdf: "pdf",
  doc: "doc",
  deck: "cards",
};

/**
 * One row of the list: a course's resource or, since MDRS-286, a celse's own
 * (`LessonResourceResponse`, which has no `type` and may send `meta: null`).
 */
export type ResourceRow = Pick<ResourceResponse, "id" | "name" | "url"> & {
  meta?: string | null;
  type?: string;
};

/**
 * The rows of a list of links (MDRS-279, design tedris/05 "Bu kursun
 * kaynakları"): each a name, an optional short line and the address it
 * opens in a new tab. The address is content: without `view_details` the API
 * leaves it out and the name is listed without a link. Only an http(s)
 * address is linked, whatever the API sent, so a stored `javascript:` can
 * never become an href. A linked row on a host with a name of its own
 * (Google Drive) says so with a chip under its name, as a recording's
 * provider does (MDRS-286). No hooks, so the server celse detail page and the
 * client course page draw the same rows.
 */
export const ResourceList = ({
  resources,
  newTab,
  testId,
  className,
}: {
  resources: readonly ResourceRow[];
  /** read after a link's name: " (yeni sekmede açılır)" */
  newTab: string;
  /** the list's `data-testid`: the celse detail page tells its two apart */
  testId?: string;
  className?: string;
}) => (
  <ul
    className={`m-0 flex list-none flex-col p-0${className ? ` ${className}` : ""}`}
    data-testid={testId}
  >
    {resources.map((resource) => {
      const href = resourceHref(resource.url);
      const provider = resourceProviderOf(href);
      const name = (
        <span className="mds-label" dir="auto">
          {resource.name}
        </span>
      );
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
                <span className="mds-visually-hidden">{newTab}</span>
              </a>
            ) : (
              name
            )}
            {resource.meta ? (
              <span className="mds-caption" dir="auto">
                {resource.meta}
              </span>
            ) : null}
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
 * `ResourceList` under a title, and who opens the links on a locked course;
 * nothing at all for a course without one. The celse detail page puts the
 * same rows in its own "Kaynaklar" card (MDRS-289).
 */
export const CourseResources = ({
  resources,
  labels,
  locked = false,
}: {
  resources: readonly ResourceRow[] | undefined;
  labels: {
    title: string;
    /** read after a link's name: " (yeni sekmede açılır)" */
    newTab: string;
    /** under the list of a locked course: who opens the links */
    locked: string;
  };
  /** the API answered `contentLocked`: the names come without addresses */
  locked?: boolean;
}) => {
  if (!resources || resources.length === 0) return null;
  return (
    <Card title={labels.title} headingLevel={2} data-testid="course-resources">
      <ResourceList
        resources={resources}
        newTab={labels.newTab}
        className="mbs-4"
      />
      {locked ? <p className="mds-caption mbs-2">{labels.locked}</p> : null}
    </Card>
  );
};
