import type { Meta, StoryObj } from "@storybook/react";
import { createKcPageStory } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({
  pageId: "login-update-password.ftl",
});

const meta = {
  title: "login/login-update-password.ftl",
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

export const WithMismatch: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        messagesPerField: {
          existsError: (fieldName: string, ...otherFieldNames: string[]) =>
            [fieldName, ...otherFieldNames].includes("password-confirm"),
          get: (fieldName: string) =>
            fieldName === "password-confirm" ? "Şifre onayı eşleşmiyor." : "",
        },
      }}
    />
  ),
};
