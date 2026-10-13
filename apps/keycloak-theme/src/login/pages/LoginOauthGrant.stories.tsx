import type { Meta, StoryObj } from "@storybook/react";
import { createKcPageStory, messageRef } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({ pageId: "login-oauth-grant.ftl" });

const meta = {
  title: "login/login-oauth-grant.ftl",
  component: KcPageStory,
} satisfies Meta<typeof KcPageStory>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * What a partner application asks for when it signs a user in through its
 * client (here `ornek-uygulama`): the profile, the e-mail address and the
 * gender, with its own terms and privacy policy linked.
 */
const partner = {
  client: {
    clientId: "ornek-uygulama",
    name: "Örnek Uygulama",
    attributes: {
      tosUri: "https://ornek.example/kullanim-sartlari",
      policyUri: "https://ornek.example/gizlilik",
    },
  },
  oauth: {
    code: "kod",
    client: "ornek-uygulama",
    clientScopesRequested: [
      { consentScreenText: messageRef("profileScopeConsentText") },
      { consentScreenText: messageRef("emailScopeConsentText") },
      { consentScreenText: messageRef("genderScopeConsentText") },
    ],
  },
};

export const Default: Story = {
  render: () => <KcPageStory />,
};

export const DefaultTurkish: Story = {
  render: () => (
    <KcPageStory kcContext={{ locale: { currentLanguageTag: "tr" } }} />
  ),
};

export const DefaultArabic: Story = {
  render: () => (
    <KcPageStory kcContext={{ locale: { currentLanguageTag: "ar" } }} />
  ),
};

export const DefaultEnglish: Story = {
  render: () => (
    <KcPageStory kcContext={{ locale: { currentLanguageTag: "en" } }} />
  ),
};

export const PartnerTurkish: Story = {
  render: () => (
    <KcPageStory
      kcContext={{ ...partner, locale: { currentLanguageTag: "tr" } }}
    />
  ),
};

export const PartnerArabic: Story = {
  render: () => (
    <KcPageStory
      kcContext={{ ...partner, locale: { currentLanguageTag: "ar" } }}
    />
  ),
};

export const PartnerEnglish: Story = {
  render: () => (
    <KcPageStory
      kcContext={{ ...partner, locale: { currentLanguageTag: "en" } }}
    />
  ),
};

/** A scope with a parameter (a dynamic scope): the parameter follows its text. */
export const WithDynamicScope: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        oauth: {
          clientScopesRequested: [
            { consentScreenText: messageRef("profileScopeConsentText") },
            {
              consentScreenText: messageRef("rolesScopeConsentText"),
              dynamicScopeParameter: "kosk:42",
            },
          ],
        },
      }}
    />
  ),
};
