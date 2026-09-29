import type { Meta, StoryObj } from "@storybook/react";
import { createKcPageStory } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({
  pageId: "login-reset-password.ftl",
});

const meta = {
  title: "login/login-reset-password.ftl",
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

export const WithUnknownUser: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        messagesPerField: {
          existsError: (fieldName: string, ...otherFieldNames: string[]) =>
            [fieldName, ...otherFieldNames].includes("username"),
          get: (fieldName: string) =>
            fieldName === "username" ? "Geçersiz kullanıcı adı." : "",
        },
      }}
    />
  ),
};
