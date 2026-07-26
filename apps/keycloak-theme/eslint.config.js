import { reactConfig } from '@madrasah/eslint-config/react'

export default [
  ...reactConfig,
  { ignores: [
    '**/dist', '**/dist_keycloak', '**/storybook-static', '**/keycloakify-dev-resources',
  ] },
]
