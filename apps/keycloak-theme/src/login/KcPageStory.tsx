import {
  type Attribute,
  createGetKcContextMock,
} from "keycloakify/login/KcContext";
import type { DeepPartial } from "keycloakify/tools/DeepPartial";
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

/** `${key}` — how the user profile names a message. */
const messageRef = (key: string) => `$\{${key}}`;

/**
 * The privacy-notice box as `config/keycloak/user-profile.json` declares it
 * (MDRS-102), so the stories and the page specs show the registration and
 * profile forms the way the realm serves them.
 */

export const privacyNoticeReadAttribute: Attribute = {
  name: "privacyNoticeRead",
  displayName: messageRef("privacyNoticeTitle"),
  required: true,
  readOnly: false,
  validators: { options: { options: ["yes"] } },
  annotations: {
    inputType: "multiselect-checkboxes",
    inputOptionLabels: { yes: messageRef("privacyNoticeRead") },
    linkUrl: "https://medaris.app/aydinlatma-metni",
    linkLabel: messageRef("privacyNoticeLinkLabel"),
  } as Attribute["annotations"],
  multivalued: false,
  html5DataAnnotations: {},
};

const withPrivacyNotice = {
  profile: {
    attributesByName: { privacyNoticeRead: privacyNoticeReadAttribute },
  },
};

export const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension,
  kcContextExtensionPerPage,
  overrides: {},
  overridesPerPage: {
    "register.ftl": withPrivacyNotice,
    "login-update-profile.ftl": withPrivacyNotice,
  },
});

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
