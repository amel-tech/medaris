import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
