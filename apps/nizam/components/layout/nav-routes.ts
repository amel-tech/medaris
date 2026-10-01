import { House, type Icon, TableIcon } from "@medaris/icons";

/**
 * Where the sidebar logo goes (MDRS-101). It pointed at `/home`, a page that
 * lived outside `[locale]` and so never resolved; the locale root is the
 * page every visitor can open, signed in or not.
 */
export const homeHref = "/";

export type NavigationRouteType = {
  title: string;
  url: string;
  isActive?: boolean;
  icon?: Icon;
  items?: NavigationRouteType[];
};

// Note: This file is used for route configuration.
// The actual title display should use i18n in the component that renders these routes.
// For now, we keep the hard-coded string here as it's just a configuration object.
// The component using this should translate the title when displaying it.
export const routes: {
  navMain: NavigationRouteType[];
} = {
  navMain: [
    {
      title: "Decks",
      url: "/decks",
      icon: TableIcon,
    },
    {
      title: "Köşkler",
      url: "/kosks",
      icon: House,
    },
  ],
};
