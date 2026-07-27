import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ADR-001 §D3: explicit, not relying on Turbopack auto-transpilation.
  transpilePackages: ['@medaris/ui', '@medaris/icons', '@medaris/i18n'],
}

export default withNextIntl(nextConfig)
