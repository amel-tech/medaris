import type { KoskResponse } from "@medaris/services/tedrisat";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Card } from "@medaris/ui/mds/card";
import { koskLevelLabel } from "~/features/courses/components/labels";
import { FollowButton } from "./follow-button";

/**
 * The keys this card reads, as a narrow signature: the full translator type
 * makes the checker expand the whole catalogue per call, which no longer
 * finishes (TS2589, MDRS-164).
 */
type Translate = (
  key:
    | "DiscoverPage.coursesCount"
    | "DiscoverPage.follow"
    | "DiscoverPage.following"
    | "DiscoverPage.followFailed",
  values?: Record<string, string | number>
) => string;

/**
 * A köşk on Keşfet (MDRS-159, design tedris/02): its mark, name and ilim
 * alanı, a line of description, and its level and course count beside the
 * follow button. The whole card is one link, to the köşk's page.
 */
export const KoskCard = ({
  kosk,
  t,
  signedIn = true,
}: {
  kosk: KoskResponse;
  t: Translate;
  signedIn?: boolean;
}) => {
  const level = koskLevelLabel(kosk.level, t as never, "DiscoverPage");
  return (
    <Card
      className="flex flex-col"
      href={`/kosks/${kosk.id}`}
      title={
        <span className="flex items-center gap-3">
          <Avatar entity decorative name={kosk.name} />
          <span>{kosk.name}</span>
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <span>
            {level ? (
              <>
                {level}
                <span className="mds-sep" aria-hidden="true">
                  ·
                </span>
              </>
            ) : null}
            {t("DiscoverPage.coursesCount", { count: kosk.courseCount })}
          </span>
          {signedIn ? (
            <FollowButton
              koskId={kosk.id}
              koskName={kosk.name}
              following={kosk.isFollowing}
              labels={{
                follow: t("DiscoverPage.follow"),
                following: t("DiscoverPage.following"),
                failed: t("DiscoverPage.followFailed"),
              }}
            />
          ) : null}
        </div>
      }
    >
      {kosk.field ? (
        <p className="mbs-4">
          <Badge variant="secondary">{kosk.field}</Badge>
        </p>
      ) : null}
      {kosk.description ? (
        <p className="mds-card__body grow" dir="auto">
          {kosk.description}
        </p>
      ) : (
        <span className="grow" />
      )}
    </Card>
  );
};
