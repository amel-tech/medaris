import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuditView } from "~/features/platform-admin/components/audit-view";
import {
  auditFiltersToQuery,
  parseAuditFilters,
} from "~/features/platform-admin/present";
import { getAuditPage } from "~/features/platform-admin/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.AuditPage");
  return { title: t("title") };
}

/**
 * Denetim kaydı (design nizam/17). The filters are the URL's query, so a link
 * carries the view. tedrisat answers a köşk nazımı, a başmüderris and anyone
 * else 403, which shows the "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const filters = parseAuditFilters(await searchParams);
  const page = await getAuditPage(filters);
  if (page === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem] px-gutter py-8">
      {/* keyed by the filters: a new view starts from its own first page */}
      <AuditView
        key={auditFiltersToQuery(filters)}
        filters={filters}
        initial={page === "not-found" ? null : page}
      />
    </div>
  );
}
