// MDRS-38: the mirror of `images.remotePatterns` in next.config.js. Next
// answers `/_next/image` with a 400 for a host outside that allow-list, so the
// UI has to ask the same question before it renders an <Image> and fall back
// to markup that does not hit the optimizer.
//
// MDRS-86: `issuer` is a parameter, not `env.NEXT_PUBLIC_KEYCLOAK_ISSUER`. This
// runs in the browser, and a NEXT_PUBLIC_ value would be inlined at `next
// build` — which made the image environment-specific. The server component
// that owns the session reads KEYCLOAK_ISSUER at runtime and passes it down,
// so one image serves every environment.
export const isOptimizableImageSrc = (
  src: string | null | undefined,
  issuer: string | null | undefined
) => {
  if (!src) {
    return false;
  }

  // Same-origin paths never reach the remote allow-list.
  if (src.startsWith("/") && !src.startsWith("//")) {
    return true;
  }

  if (!issuer) {
    return false;
  }

  try {
    const source = new URL(src);
    const allowed = new URL(issuer);

    return (
      source.protocol === allowed.protocol &&
      source.hostname === allowed.hostname
    );
  } catch {
    return false;
  }
};
