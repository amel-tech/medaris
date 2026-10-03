import type { Meta, StoryObj } from "@storybook/react";
import { createKcPageStory } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({ pageId: "info.ftl" });

const meta = {
  title: "login/info.ftl",
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

export const EmailVerified: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        messageHeader: undefined,
        message: {
          type: "success",
          summary:
            "Hesabın etkinleşti. Köşkleri keşfedip derslere başvurabilirsin.",
        },
        pageRedirectUri: "https://tedris.example.org/start",
      }}
    />
  ),
};

export const WithRequiredActions: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        message: {
          type: "info",
          summary: "Aşağıdaki eylemleri gerçekleştirin",
        },
        requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
        actionUri: "#",
      }}
    />
  ),
};

/** Canvas medaris/17: a header Keycloak sends of its own, over one sentence. */
export const EmailChanged: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        locale: { currentLanguageTag: "tr" },
        messageHeader: "E-posta adresin değişti",
        message: {
          type: "success",
          summary: "Yeni adresin hesabına kaydedildi.",
        },
        pageRedirectUri: "https://tedris.example.org/start",
      }}
    />
  ),
};
