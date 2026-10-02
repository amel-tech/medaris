import {
  PlaceholderPage,
  placeholderMetadata,
} from "~/features/shell/components/placeholder-page";

export const generateMetadata = () => placeholderMetadata("general.pano");

/** Pano (nazir 01) is a later package's; until then the scope's own page is the shared placeholder. */
export default function Page() {
  return <PlaceholderPage labelKey="general.pano" />;
}
