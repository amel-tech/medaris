import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

/**
 * The single remote host `next/image` may fetch from, derived from the
 * Keycloak issuer. Returns an empty list when the issuer is absent or
 * unparseable — no remote image is better than every remote image. env.ts
 * requires the variable, so a real build never reaches the empty case.
 *
 * @returns {import('next').NextConfig['images']['remotePatterns']}
 */
function keycloakRemotePatterns() {
  const issuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER;

  if (!issuer) {
    return [];
  }

  try {
    const { protocol, hostname } = new URL(issuer);

    if (protocol !== "https:" && protocol !== "http:") {
      return [];
    }

    return [{ protocol: protocol.slice(0, -1), hostname }];
  } catch {
    return [];
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // MDRS-16: the deploy image ships `.next/standalone`. pnpm's node_modules is
  // a symlink farm into node_modules/.pnpm, so a runtime stage cannot copy a
  // subtree of it; Next's file tracing produces a real, pruned tree instead.
  output: "standalone",
  transpilePackages: [
    "@medaris/ui",
    "@medaris/icons",
    "@medaris/i18n",
    "@medaris/utils",
    "@medaris/services",
  ],
  experimental: {
    optimizePackageImports: [
      "@medaris/icons",
      "@medaris/icons/ssr",
      "@phosphor-icons/react",
    ],
  },
  redirects: async () => {
    return [
      {
        source: "/",
        destination: "/home",
        permanent: true,
      },
    ];
  },
  images: {
    // MDRS-38: `hostname: "**"` made /_next/image an open fetch-and-cache proxy
    // for any https host. The only remote <Image> in this app is the Keycloak
    // profile picture (features/user-avatar.tsx), so the allow-list is the
    // issuer's own host and nothing else. Keep lib/image-hosts.ts in sync.
    remotePatterns: keycloakRemotePatterns(),
  },
};

export default withNextIntl(nextConfig);
