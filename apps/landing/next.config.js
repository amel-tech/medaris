import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // MDRS-16: the deploy image ships `.next/standalone`. pnpm's node_modules is
  // a symlink farm into node_modules/.pnpm, so a runtime stage cannot copy a
  // subtree of it; Next's file tracing produces a real, pruned tree instead.
  output: "standalone",
  // ADR-001 §D3: explicit, not relying on Turbopack auto-transpilation.
  transpilePackages: ["@medaris/ui", "@medaris/icons", "@medaris/i18n"],
};

export default withNextIntl(nextConfig);
