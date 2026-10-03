import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GroupsView } from "~/features/permissions/components/groups-view";
import {
  getCatalog,
  getGroups,
  getGroupUsers,
  getNazims,
} from "~/features/permissions/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.GroupsPage");
  return { title: t("title") };
}

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * İzin grupları (design nizam/13), for the Medaris başnazımı alone: the groups
 * and the form of the selected one. `?grup=<id>` selects a group, `?grup=yeni`
 * opens the empty form, and with neither the first group is selected. tedrisat
 * answers anyone else 403, which shows nizam/06.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ grup?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = first((await searchParams).grup);
  const [groups, catalog, nazims] = await Promise.all([
    getGroups(),
    getCatalog(),
    getNazims(),
  ]);
  if ([groups, catalog, nazims].includes("forbidden")) forbidden();

  const list = groups === "forbidden" ? null : groups;
  const selected =
    query === "yeni" ? "new" : query !== "" ? query : (list?.[0]?.id ?? "new");
  const users =
    list?.some((g) => g.id === selected) === true
      ? await getGroupUsers(selected)
      : null;
  if (users === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <GroupsView
        groups={list}
        catalog={catalog === "forbidden" ? null : catalog}
        nazims={nazims === "forbidden" ? null : nazims}
        selected={selected}
        users={users}
      />
    </div>
  );
}
