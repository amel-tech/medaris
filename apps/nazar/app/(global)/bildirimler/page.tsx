import {
  PlaceholderPage,
  placeholderMetadata,
} from "~/features/shell/components/placeholder-page";

export const generateMetadata = () =>
  placeholderMetadata("general.notifications");

/** The notification list is not in the Nazır canvas yet; the bell and the menu badge already count the unread. */
export default function Page() {
  return <PlaceholderPage labelKey="general.notifications" />;
}
