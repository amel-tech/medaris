import {
  PlaceholderPage,
  placeholderMetadata,
} from "~/features/shell/components/placeholder-page";

export const generateMetadata = () => placeholderMetadata("ders.overview");

/** Genel bakış of a course has no screen in the canvas yet; the shared placeholder stands in. */
export default function Page() {
  return <PlaceholderPage labelKey="ders.overview" />;
}
