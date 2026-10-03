import { BellIcon, MadrasahLogoIcon } from "@medaris/icons/ssr";
import { Input } from "@medaris/ui/components/input";
import { Suspense } from "react";
import { env } from "~/env";
import KeycloakLogin from "~/features/keycloak/login";
import { auth } from "~/lib/auth_options";
import LocaleSwitcher from "../i18n/locale-switcher";
import { UserHeaderMenu } from "./user-header-menu";
import { UserNotifications } from "./user-notification-menu";

export const Header = async () => {
  const session = await auth();

  return (
    <header
      data-legacy-header
      className="flex justify-between items-center mx-auto w-full max-w-[80rem] py-8"
    >
      <div className="flex gap-4 items-center">
        <MadrasahLogoIcon size={36} />
        <p className="text-xl font-medium text-brand-primary">Medaris</p>
      </div>

      <div className="flex items-center space-x-4">
        <Input placeholder="Search..." className="max-w-64 p-4" />
        {session ? (
          <>
            <Suspense
              fallback={<BellIcon size={24} className="text-primary" />}
            >
              <UserNotifications />
            </Suspense>
            <UserHeaderMenu imageIssuer={env.KEYCLOAK_ISSUER} />
          </>
        ) : (
          <KeycloakLogin />
        )}
        <LocaleSwitcher />
      </div>
    </header>
  );
};
