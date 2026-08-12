/** @type {import('next').NextConfig} */
const nextConfig = {
  // ADR-001 §D3: explicit, not relying on Turbopack auto-transpilation.
  transpilePackages: ["@medaris/ui", "@medaris/icons"],
};

export default nextConfig;
