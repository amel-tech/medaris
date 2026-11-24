"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { useTranslations } from "next-intl";
import type { Pager } from "../present";

/** "21–40 / 57" with the links to the page before and after; nothing for a list of one page. */
export function ListPager({
  pager,
  total,
  hrefOf,
}: {
  pager: Pager;
  total: number;
  hrefOf: (page: number) => string;
}) {
  const t = useTranslations("nizam.KoskLists");
  if (pager.pages <= 1 && pager.prev === null) return null;
  return (
    <nav
      aria-label={t("pager.label")}
      className="flex flex-wrap items-center justify-between gap-3"
      data-testid="list-pager"
    >
      <p className="mds-caption m-0">
        {t("pager.range", { from: pager.from, to: pager.to, total })}
      </p>
      <span className="flex gap-2">
        <Button
          variant="outline"
          size="small"
          href={hrefOf(pager.prev ?? pager.page)}
          disabled={pager.prev === null}
        >
          {t("pager.prev")}
        </Button>
        <Button
          variant="outline"
          size="small"
          href={hrefOf(pager.next ?? pager.page)}
          disabled={pager.next === null}
        >
          {t("pager.next")}
        </Button>
      </span>
    </nav>
  );
}

/** The list could not be read: what failed, and the page again. */
export function ListFailed({ title, href }: { title: string; href: string }) {
  const t = useTranslations("nizam.KoskLists");
  return (
    <Alert tone="error" title={title}>
      <p>{t("loadFailed")}</p>
      <Button variant="outline" size="small" href={href}>
        {t("retry")}
      </Button>
    </Alert>
  );
}
