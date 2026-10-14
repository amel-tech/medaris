import {
  type Attribute,
  createGetKcContextMock,
} from "keycloakify/login/KcContext";
import type { DeepPartial } from "keycloakify/tools/DeepPartial";
import { deepAssign } from "keycloakify/tools/deepAssign";
import { kcEnvDefaults, themeNames } from "../kc.gen";
import type {
  KcContext,
  KcContextExtension,
  KcContextExtensionPerPage,
} from "./KcContext";
import KcPage from "./KcPage";

const kcContextExtension: KcContextExtension = {
  themeName: themeNames[0]!,
  properties: {
    ...kcEnvDefaults,
  },
};
const kcContextExtensionPerPage: KcContextExtensionPerPage = {};

/** `${key}` — how Keycloak names a message in a profile or a scope. */
export const messageRef = (key: string) => `$\{${key}}`;

/** An attribute as `config/keycloak/user-profile.json` declares it. */
export interface DeclaredAttribute {
  name: string;
  displayName?: string;
  validations?: Record<string, Record<string, unknown>>;
  annotations?: Record<string, unknown>;
  required?: { roles?: string[]; scopes?: string[] };
  permissions?: { view?: string[]; edit?: string[] };
  multivalued?: boolean;
  group?: string;
}

/**
 * The realm's user profile, the one the provisioning scripts apply (MDRS-97).
 * Read through Vite, not imported: `config/` is no Nx project, and module
 * boundaries refuse a relative import of a file outside one. Only stories and
 * specs load this file; the theme Keycloak serves never does.
 */
export const REALM_PROFILE = Object.values(
  import.meta.glob<{
    attributes: DeclaredAttribute[];
    groups?: {
      name: string;
      displayHeader?: string;
      displayDescription?: string;
    }[];
  }>("../../../../config/keycloak/user-profile.json", {
    eager: true,
    import: "default",
  })
)[0] ?? { attributes: [] };

const AUTOCOMPLETE: Partial<Record<string, Attribute["autocomplete"]>> = {
  username: "username",
  email: "email",
};

/**
 * One declared attribute the way Keycloak serves it to a user's form: its
 * `validations` become `validators`, `required` and `readOnly` become what
 * they mean for the user role, and its group is resolved from the profile's
 * groups. The user name is required whatever the profile says: Keycloak
 * requires it while `registrationEmailAsUsername` is off, and its admin
 * console does not let the profile say otherwise.
 */
export function servedAttribute(declared: DeclaredAttribute): Attribute {
  const group = REALM_PROFILE.groups?.find((g) => g.name === declared.group);
  return {
    name: declared.name,
    displayName: declared.displayName,
    required:
      declared.name === "username" ||
      (declared.required?.roles?.includes("user") ?? false),
    readOnly: !(declared.permissions?.edit ?? []).includes("user"),
    validators: (declared.validations ?? {}) as Attribute["validators"],
    annotations: (declared.annotations ?? {}) as Attribute["annotations"],
    multivalued: declared.multivalued ?? false,
    html5DataAnnotations: {},
    autocomplete: AUTOCOMPLETE[declared.name],
    group:
      group !== undefined
        ? {
            name: group.name,
            displayHeader: group.displayHeader,
            displayDescription: group.displayDescription,
            annotations: {},
            html5DataAnnotations: {},
          }
        : undefined,
  };
}

/** What the user may see of the realm's profile, in the profile's order. */
export const realmAttributes = () =>
  REALM_PROFILE.attributes
    .filter((a) =>
      [...(a.permissions?.view ?? []), ...(a.permissions?.edit ?? [])].includes(
        "user"
      )
    )
    .map(servedAttribute);

/**
 * An account made before `gender` became required: everything filled in but
 * the gender, which is what sends it to the profile page. Its user name is
 * read-only there, since the realm does not let a user change it.
 */
const EXISTING_USER: Record<string, Partial<Attribute>> = {
  firstName: { value: "Zeynep Betül" },
  lastName: { value: "Karahanlı" },
  username: { value: "zeynep.karahanli", readOnly: true },
  email: { value: "zeynep.karahanli@example.com" },
  privacyNoticeRead: { values: ["yes"] },
};

const { getKcContextMock: getKeycloakifyMock } = createGetKcContextMock({
  kcContextExtension,
  kcContextExtensionPerPage,
  overrides: {},
  overridesPerPage: {},
});

/**
 * keycloakify's mock with the realm's own profile in it, so the stories and
 * the page specs show the registration and profile forms the way the realm
 * serves them: its attributes, in its order, nothing of keycloakify's sample
 * profile (whose e-mail must end in gmail.com). A story's or a spec's
 * overrides apply on top; an attribute they add comes after the realm's.
 */
export function getKcContextMock<PageId extends KcContext["pageId"]>(params: {
  pageId: PageId;
  overrides?: DeepPartial<Extract<KcContext, { pageId: PageId }>>;
}): Extract<KcContext, { pageId: PageId }> {
  const { pageId, overrides } = params;
  const kcContext = getKeycloakifyMock({ pageId }) as Extract<
    KcContext,
    { pageId: PageId }
  >;

  if (pageId === "register.ftl" || pageId === "login-update-profile.ftl") {
    const existing = pageId === "login-update-profile.ftl";
    (
      kcContext as { profile: { attributesByName: Record<string, Attribute> } }
    ).profile.attributesByName = Object.fromEntries(
      realmAttributes().map((attribute) => [
        attribute.name,
        existing
          ? { ...attribute, ...EXISTING_USER[attribute.name] }
          : attribute,
      ])
    );
  }

  if (overrides !== undefined) {
    deepAssign({ target: kcContext, source: overrides });
  }

  return kcContext;
}

export function createKcPageStory<PageId extends KcContext["pageId"]>(params: {
  pageId: PageId;
}) {
  const { pageId } = params;

  function KcPageStory(props: {
    kcContext?: DeepPartial<Extract<KcContext, { pageId: PageId }>>;
  }) {
    const { kcContext: overrides } = props;

    const kcContextMock = getKcContextMock({
      pageId,
      overrides,
    });

    return <KcPage kcContext={kcContextMock} />;
  }

  return { KcPageStory };
}
