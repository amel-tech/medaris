"use client";

import {
  type BreadcrumbEntry,
  Breadcrumbs as UiBreadcrumbs,
} from "@medaris/ui/components/breadcrumb";
import { useTranslations } from "next-intl";
import { useBreadcrumb } from "~/hooks/useBreadcrumb";
import type { NavigationRouteType } from "./nav-routes";

interface BreadcrumbsProps {
  routes: {
    navMain: NavigationRouteType[];
  };
}

export function Breadcrumbs({ routes }: BreadcrumbsProps) {
  const t = useTranslations("nizam");
  const breadcrumbs = useBreadcrumb(routes);

  const items: BreadcrumbEntry[] = [
    { label: t("Breadcrumbs.home"), href: "/" },
    ...breadcrumbs.map((crumb) => ({ label: crumb.title, href: crumb.url })),
  ];

  return <UiBreadcrumbs items={items} />;
}
