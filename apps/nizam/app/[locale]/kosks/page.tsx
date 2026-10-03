import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { getMe } from "~/features/kosks/actions";
import {
  type DirectoryFilters,
  filtersFromParams,
} from "~/features/kosks/admin-present";
import { getKoskDirectory } from "~/features/kosks/admin-reads";
import { DirectorySkeleton } from "~/features/kosks/components/directory-skeleton";
import { KosksDirectory } from "~/features/kosks/components/kosks-directory";
import { TaughtCourses } from "~/features/kosks/components/taught-courses";
import { taughtElsewhere } from "~/features/kosks/kosk-abilities";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskDirectory");
  return { title: t("title") };
}

type Search = Record<string, string | string[] | undefined>;

async function Directory({
  filters,
  open,
}: {
  filters: DirectoryFilters;
  open: boolean;
}) {
  const [directory, me] = await Promise.all([
    getKoskDirectory(filters),
    getMe(),
  ]);
  if (directory === "forbidden") forbidden();
  return (
    <>
      <KosksDirectory
        directory={directory === "not-found" ? null : directory}
        filters={filters}
        viewerId={me?.id ?? null}
        chief={me?.roles.systemAdmin ?? false}
        initialOpen={open}
      />
      <TaughtCourses courses={taughtElsewhere(me)} />
    </>
  );
}

/**
 * Köşkler (design nizam/09): every köşk on the platform for the Medaris
 * başnazımı, a köşk nazımı's own for them. tedrisat answers anyone else 403,
 * which shows the "Bu bölüm için izniniz yok" screen (nizam/06). The filters
 * are in the URL: `?durum=`, `?seviye=`, `?alan=`, `?gorunurluk=`, `?q=` and
 * `?sayfa=`. The page streams behind its own skeleton: a `loading.tsx` here
 * would also stand in for every köşk page below this one.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const filters = filtersFromParams(search);
  // the home page's "Köşk aç" is `?ac=1`
  const open = search.ac === "1";

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <Suspense fallback={<DirectorySkeleton />}>
        <Directory filters={filters} open={open} />
      </Suspense>
    </div>
  );
}
