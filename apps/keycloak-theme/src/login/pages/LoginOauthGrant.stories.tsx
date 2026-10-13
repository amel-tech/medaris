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
 * What sidre.tr asks for when it signs a user in through its client
 * `sidre-tr`: the profile, the e-mail address and the gender, with its own
 * terms and privacy policy linked.
 */
const sidre = {
  client: {
    clientId: "sidre-tr",
    name: "sidre.tr",
    attributes: {
      tosUri: "https://sidre.tr/kullanim-sartlari",
      policyUri: "https://sidre.tr/gizlilik",
    },
  },
  oauth: {
    code: "kod",
    client: "sidre-tr",
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

export const SidreTurkish: Story = {
  render: () => (
    <KcPageStory
      kcContext={{ ...sidre, locale: { currentLanguageTag: "tr" } }}
    />
  ),
};

export const SidreArabic: Story = {
  render: () => (
    <KcPageStory
      kcContext={{ ...sidre, locale: { currentLanguageTag: "ar" } }}
    />
  ),
};

export const SidreEnglish: Story = {
  render: () => (
    <KcPageStory
      kcContext={{ ...sidre, locale: { currentLanguageTag: "en" } }}
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
