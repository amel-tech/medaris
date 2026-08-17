import { env } from "~/env";

// MDRS-38: the mirror of `images.remotePatterns` in next.config.js. Next
// answers `/_next/image` with a 400 for a host outside that allow-list, so the
// UI has to ask the same question before it renders an <Image> and fall back
// to markup that does not hit the optimizer.
export const isOptimizableImageSrc = (src: string | null | undefined) => {
  if (!src) {
    return false;
  }

  // Same-origin paths never reach the remote allow-list.
  if (src.startsWith("/") && !src.startsWith("//")) {
    return true;
  }

  try {
    const source = new URL(src);
    const issuer = new URL(env.NEXT_PUBLIC_KEYCLOAK_ISSUER);

    return (
      source.protocol === issuer.protocol && source.hostname === issuer.hostname
    );
  } catch {
    return false;
  }
};
