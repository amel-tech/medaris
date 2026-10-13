/**
 * The Keycloak the theme ships on. apps/keycloak-theme/Dockerfile pins its
 * version once, in `ARG KEYCLOAK_VERSION`; the specs that start a Keycloak
 * read it from there, so they run the version production runs and a bump is
 * one line.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DOCKERFILE = join(__dirname, "../Dockerfile");

export function keycloakVersion(): string {
  const match = readFileSync(DOCKERFILE, "utf8").match(
    /^ARG KEYCLOAK_VERSION=(\S+)$/m
  );
  if (match?.[1] === undefined) {
    throw new Error(`${DOCKERFILE}: no ARG KEYCLOAK_VERSION=<version> line`);
  }
  return match[1];
}

export const KEYCLOAK_IMAGE = `quay.io/keycloak/keycloak:${keycloakVersion()}`;
