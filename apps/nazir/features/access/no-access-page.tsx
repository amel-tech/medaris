import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { env } from "~/env";
import { PortalFrame } from "~/features/shell/components/portal-frame";
import type { Person } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";

/**
 * "Bu portala erişiminiz yok" (nazir 02): a signed-in person with no medrese
 * and no course. The shell is down to its brand and the person (their roles,
 * "Talebe" when they hold none), the row is not a link, and the one way on
 * is back to Tedris, whose address comes from the environment and is left
 * out when it is not set.
 */
export async function NoAccessPage({
  person,
  roles,
}: {
  person: Person;
  roles: string[];
}) {
  const t = await getMessages("nazir.NoAccess");
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
            {tedris ? (
              <Button href={tedris} variant="secondary">
                {t("back")}
              </Button>
            ) : null}
          </div>
        }
      >
        {t("text")}
      </SystemState>
    </PortalFrame>
  );
}
