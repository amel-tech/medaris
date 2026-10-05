import type { ResourceResponse } from "@medaris/services/tedrisat";
import { Card } from "@medaris/ui/mds/card";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { resourceHref } from "@medaris/utils";

const ICONS: Record<string, IconName> = {
  pdf: "pdf",
  doc: "doc",
  deck: "cards",
};

/**
 * A course's resources (MDRS-279, design tedris/05 "Bu kursun kaynakları"):
 * links only for now, each a name, an optional short line and the address it
 * opens in a new tab. The address is content: without `view_details` the API
 * leaves it out and the name is listed without a link. Only an http(s)
 * address is linked, whatever the API sent, so a stored `javascript:` can
 * never become an href. No hooks, so the server session page and the client
 * course page draw the same list; nothing at all for a course without one.
 */
export const CourseResources = ({
  resources,
  labels,
  locked = false,
}: {
  resources: readonly ResourceResponse[] | undefined;
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
      <ul className="m-0 flex list-none flex-col p-0 mbs-4">
        {resources.map((resource) => {
          const href = resourceHref(resource.url);
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
                    <span className="mds-visually-hidden">{labels.newTab}</span>
                  </a>
                ) : (
                  name
                )}
                {resource.meta ? (
                  <span className="mds-caption" dir="auto">
                    {resource.meta}
                  </span>
                ) : null}
              </span>
              {href ? <Icon name="externalLink" size="sm" /> : null}
            </li>
          );
        })}
      </ul>
      {locked ? <p className="mds-caption mbs-2">{labels.locked}</p> : null}
    </Card>
  );
};
