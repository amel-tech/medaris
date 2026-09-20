"use client";

import {
  BookIcon,
  CaretDownIcon,
  CircleNotchIcon,
  GearIcon,
  QuestionIcon,
  SignOutIcon,
  UserIcon,
} from "@medaris/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@medaris/ui/components/dropdown-menu";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { UserAvatar } from "~/features/user-avatar";
import Version from "./version";

type UserHeaderMenuProps = {
  /** KEYCLOAK_ISSUER from the server; the avatar host check runs client-side. */
  imageIssuer: string;
};

export const UserHeaderMenu = ({ imageIssuer }: UserHeaderMenuProps) => {
  const t = useTranslations("tedris");
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <CircleNotchIcon className="h-6 w-6 animate-spin" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="flex items-center gap-2 cursor-pointer select-none hover:bg-gray-100 rounded-md">
          <UserAvatar user={session?.user} imageIssuer={imageIssuer} />
          <div className="flex flex-col text-left">
            <p className="text-sm whitespace-nowrap">{session?.user?.name}</p>
            <p className="text-xs whitespace-nowrap text-neutral-tertiary">
              {t("UserHeaderMenu.talebe")}
            </p>
          </div>
          <CaretDownIcon size={16} />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="p-2">
        <DropdownMenuLabel>{t("UserHeaderMenu.profile")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <BookIcon className="text-neutral-primary" />
          <p className="text-neutral-primary text-sm">
            {t("UserHeaderMenu.myLearning")}
          </p>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <UserIcon className="text-neutral-primary" />
          <p className="text-neutral-primary text-sm">
            {t("UserHeaderMenu.profile")}
          </p>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <GearIcon className="text-neutral-primary" />
          <p className="text-neutral-primary text-sm">
            {t("UserHeaderMenu.accountSettings")}
          </p>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <QuestionIcon className="text-neutral-primary" />
          <p className="text-neutral-primary text-sm">
            {t("UserHeaderMenu.helpAndSupport")}
          </p>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer">
          <SignOutIcon className="text-neutral-primary" />
          <p className="text-neutral-primary text-sm">
            {t("UserHeaderMenu.signOut")}
          </p>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Version />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
