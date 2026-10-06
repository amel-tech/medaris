import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { env } from "~/env";
import { SignOutButton } from "~/features/account/components/sign-out-button";
import { PortalFrame } from "~/features/shell/components/portal-frame";
import type { Person } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";

/**
 * "Bu portala erişiminiz yok" (nazir 02): a signed-in person with no medrese
 * and no course. The shell is down to its brand and the person (their roles,
 * "Talebe" when they hold none), the row is not a link, and the ways on are
 * back to Tedris, whose address comes from the environment and is left out
 * when it is not set, and "Çıkış yap" (MDRS-248): the person may simply have
 * signed in with the wrong account, and without it this page was a dead end.
 */
export async function NoAccessPage({
  person,
  roles,
}: {
  person: Person;
  roles: string[];
}) {
  const t = await getMessages("nazar.NoAccess");
  const account = await getMessages("nazar.Account");
  const tedris = env.TEDRIS_URL || null;

  return (
    <PortalFrame person={person} roles={roles} scopes={[]} current={null}>
      <SystemState
        shell
        title={t("title")}
        className="grow justify-center"
        action={
          <div className="flex flex-col items-center gap-3">
            {person.email ? (
              <p className="mds-caption">
                {t("account")}{" "}
                <code className="mds-mono" dir="ltr">
                  {person.email}
                </code>
              </p>
            ) : null}
            <div className="flex flex-wrap justify-center gap-3">
              {tedris ? (
                <Button href={tedris} variant="secondary">
                  {t("back")}
                </Button>
              ) : null}
              <SignOutButton
                label={account("signOut")}
                busy={account("signOutBusy")}
              />
            </div>
          </div>
        }
      >
        {t("text")}
      </SystemState>
    </PortalFrame>
  );
}
