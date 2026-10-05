import type { KoskResponse } from "@medaris/services/tedrisat";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Card } from "@medaris/ui/mds/card";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { FollowButton } from "./follow-button";

// Typed by what the card calls, not by the whole catalogue: whether this file's
// `t(...)` hit TS2589 depended on what else the program checked first (MDRS-166).
type Translate = LooseTranslator;

/**
 * A köşk on Keşfet (MDRS-159, design tedris/02): its mark and name, a line of
 * description, and its course count beside the follow button. The whole card is one link, to the köşk's page.
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
