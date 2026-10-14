import type { Meta, StoryObj } from "@storybook/react";
import { createKcPageStory } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({
  pageId: "login-update-profile.ftl",
});

const meta = {
  title: "login/login-update-profile.ftl",
  component: KcPageStory,
} satisfies Meta<typeof KcPageStory>;

export default meta;

type Story = StoryObj<typeof meta>;

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

export const AppInitiated: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        isAppInitiatedAction: true,
      }}
    />
  ),
};

/**
 * What an account made before `gender` became required meets at its next
 * sign-in: Keycloak names the missing attribute, the rest is filled in.
 */
export const MissingGender: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        messagesPerField: {
          existsError: (fieldName: string, ...otherFieldNames: string[]) =>
            [fieldName, ...otherFieldNames].includes("gender"),
          get: (fieldName: string) =>
            fieldName === "gender" ? "Lütfen bu alanı doldurun." : "",
          exists: (fieldName: string) => fieldName === "gender",
        },
      }}
    />
  ),
};

export const MissingGenderArabic: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "ar" },
        messagesPerField: {
          existsError: (fieldName: string, ...otherFieldNames: string[]) =>
            [fieldName, ...otherFieldNames].includes("gender"),
          get: (fieldName: string) =>
            fieldName === "gender" ? "يرجى تعبئة هذا الحقل." : "",
          exists: (fieldName: string) => fieldName === "gender",
        },
      }}
    />
  ),
};
