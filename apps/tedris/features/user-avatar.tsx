import Image from "next/image";
import type { BaseUser } from "next-auth";
import { isOptimizableImageSrc } from "~/lib/image-hosts";

type UserAvatar = {
  user?: BaseUser;
};
export const UserAvatar = ({ user }: UserAvatar) => {
  const initials = `${user.name}`
    .split(" ")
    .map((name) => name.charAt(0))
    .join("");

  // MDRS-38: `user.image` is whatever the identity provider put in the
  // profile, so it can point outside the next.config.js allow-list. Render the
  // initials instead of letting the optimizer answer 400 into an <img>.
  const avatarSrc = isOptimizableImageSrc(user.image) ? user.image : null;

  return (
    <div className="border border-gray-300 rounded-sm h-9 w-9 overflow-hidden">
      {avatarSrc ? (
        <Image
          src={avatarSrc}
          alt={user.name || ""}
          width={36}
          height={36}
          className="w-full h-full rounded-sm"
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full bg-gray-200">
          <span className="text-sm font-medium text-gray-700">{initials}</span>
        </div>
      )}
    </div>
  );
};
