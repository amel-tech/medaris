import createNextIntlPlugin from 'next-intl/plugin'
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@medaris/ui', '@medaris/icons', '@medaris/i18n', '@medaris/utils', '@medaris/services'],
  experimental: {
    optimizePackageImports: ['@medaris/icons', '@medaris/icons/ssr', '@phosphor-icons/react'],
  },
}

export default withNextIntl(nextConfig)
