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
# The server is built here (`kc.sh build`), with the theme in providers/, so
# production runs `start --optimized` and does not re-augment on every start
# (29.6 s of the 2026-10-13 start). A new theme is a new image, built again.
# Measured locally against Postgres: `start --optimized` was ready in 14-18 s,
# a plain `start` of the same image still re-augmented and took 45 s.
#
# The build options:
# - KC_DB=postgres, what production connects to. Only in the build stage: the
#   smoke test boots this image with `start-dev` and no database, which a
#   KC_DB in the final image would turn into a Postgres connection.
# - KC_HEALTH_ENABLED=true, for the Coolify healthcheck on :9000.
# - KC_CACHE=local: one Keycloak, no cluster. With the default `ispn` the
#   2026-10-13 start spent 18 s trying to JOIN the stopped container JDBC_PING
#   still listed. User sessions are kept in the database either way.
# The last two are repeated in the final image, so a command left at plain
# `start` still re-augments with a local cache and a health endpoint.
ARG KEYCLOAK_VERSION=26.6.3
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION} AS build
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_CACHE=local

# The base image owns /opt/keycloak as keycloak:root (uid 1000, gid 0); the
# file name is the theme id, as the realms ask for it.
COPY --chown=keycloak:root keycloak-theme-for-kc-all-other-versions.jar /opt/keycloak/providers/medaris-keycloak-theme.jar
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
ENV KC_HEALTH_ENABLED=true
ENV KC_CACHE=local
COPY --from=build /opt/keycloak/ /opt/keycloak/
