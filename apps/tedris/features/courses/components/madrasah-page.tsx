import { MadrasahLogoIcon } from "@medaris/icons/ssr";
import type {
  KoskResponse,
  MadrasahResponse,
} from "@medaris/services/tedrisat";
import { Breadcrumbs } from "@medaris/ui/components/breadcrumb";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverPlaceholder } from "./cover";

/**
 * A medrese's intro page (MDRS-122), open to signed-out visitors. There is no
 * drawing for it yet, so it is the köşk page's header card over a grid of the
 * medrese's köşks — the same building blocks, nothing new. The köşks are the
 * listed ones only: an unlisted köşk is in no list (MDRS-122).
 */
export const MadrasahPage = async ({
  madrasah,
  kosks,
}: {
  madrasah: MadrasahResponse;
  kosks: KoskResponse[];
}) => {
  const t = await getTranslations("tedris");

  return (
    <div className="pb-16">
      <Breadcrumbs
        className="mb-5"
        linkComponent={Link}
        items={[
          { label: t("TabView.learning"), href: "/learning" },
          { label: madrasah.name },
        ]}
      />

      <div className="mb-7 grid grid-cols-[auto_1fr] items-center gap-6 rounded-2xl border bg-gradient-to-b from-slate-50 to-white p-6">
        <div
          className="grid size-24 place-items-center rounded-2xl border"
          style={{ background: `oklch(0.95 0.05 ${madrasah.coverHue})` }}
        >
          <MadrasahLogoIcon size={56} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">
              {madrasah.name}
            </h1>
            <span className="text-sm text-muted-foreground">
              @{madrasah.handle}
            </span>
          </div>
          {madrasah.description && (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {madrasah.description}
            </p>
          )}
        </div>
      </div>

      <h2 className="mb-3.5 text-lg font-semibold tracking-tight">
        {t("MadrasahPage.kosks")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kosks.map((kosk) => (
          <Link
            key={kosk.id}
            href={`/kosks/${kosk.id}`}
            className="flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-colors hover:border-slate-300"
          >
            <CoverPlaceholder
              hue={kosk.coverHue}
              className="h-16 rounded-none"
            />
            <div className="flex flex-1 flex-col px-4 py-3.5">
              <h3 className="text-[15px] font-semibold tracking-tight">
                {kosk.name}
              </h3>
              {kosk.handle && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {kosk.handle}
                </div>
              )}
              {kosk.description && (
                <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  {kosk.description}
                </p>
              )}
              <div className="mt-auto pt-3 text-xs text-muted-foreground">
                {t("KoskPage.coursesCount", { count: kosk.courseCount })}
              </div>
            </div>
          </Link>
        ))}
        {kosks.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            {t("MadrasahPage.noKosks")}
          </p>
        )}
      </div>
    </div>
  );
};
