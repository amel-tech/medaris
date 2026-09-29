import type { Meta, StoryObj } from "@storybook/react";
import { createKcPageStory } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({ pageId: "login-verify-email.ftl" });

const meta = {
  title: "login/login-verify-email.ftl",
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

export const WithResendMessage: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        message: {
          type: "success",
          summary: "Daha fazla talimatla kısa sürede bir e-posta almalısınız.",
        },
      }}
    />
  ),
};
