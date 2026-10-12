# Keycloak with the Medaris theme baked in: ghcr.io/amel-tech/medaris-keycloak.
#
# The build context is the theme JAR alone, never the repository:
#   docker build -f apps/keycloak-theme/Dockerfile -t medaris-keycloak <dir holding the JAR>
# The JAR is keycloakify's keycloak-theme-for-kc-all-other-versions.jar (the
# one Keycloak 26 needs), built and smoke-tested by keycloak-theme-jar.yaml.
#
# KEYCLOAK_VERSION is the one place the Keycloak version is pinned. The theme
# smoke test (tools/keycloak/smoke-theme-jar.sh), `run-keycloak` in
# package.json and test/email.e2e.spec.ts all read it from this line.
# 26.6.3 is what production ran on 2026-10-12 (`kc.sh --version`); never pin
# below what production runs, because its database is already migrated to
# that version.
#
# Nothing else is set here: the Coolify service keeps its own command
# (`start …`) and environment. Keycloak loads a new provider when it
# re-augments at `start`; `start --optimized` would skip that and keep serving
# the theme the image was last built with (see the runbook).
ARG KEYCLOAK_VERSION=26.6.3
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}

# The base image owns /opt/keycloak as keycloak:root (uid 1000, gid 0); the
# file name is the theme id, as the realms ask for it.
COPY --chown=keycloak:root keycloak-theme-for-kc-all-other-versions.jar /opt/keycloak/providers/medaris-keycloak-theme.jar
