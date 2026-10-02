import { kcSanitize } from "keycloakify/lib/kcSanitize";

/**
 * Keycloak sends some of its messages as HTML. `kcSanitize` strips what is not
 * safe, and only then does the text go in through `innerHTML`.
 */
export function Html(props: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: kcSanitize(props.html) }} />;
}
