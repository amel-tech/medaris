import type { MadrasahExploreResponse } from "@medaris/services/tedrisat";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import Link from "next/link";
import type { LooseTranslator } from "~/lib/i18n/loose";

// Typed by what the card calls, not by the whole catalogue, like the köşk card
// (TS2589 once the celse texts joined the catalogue, MDRS-162).
type Translate = LooseTranslator;

/**
 * A medrese on Keşfet (MDRS-159, design tedris/02): its mark and name, its
 * başmüderris, and each listed course as a link of its own beside a small
 * cover. The name leads to the medrese's page; a medrese with no listed course
 * says so.
 */
export const MadrasahCard = ({
  madrasah,
  t,
}: {
  madrasah: MadrasahExploreResponse;
  t: Translate;
}) => (
  <Card
    className="flex flex-col"
    href={`/madrasahs/${madrasah.id}`}
    title={
      <span className="flex items-center gap-3">
        <Avatar entity decorative name={madrasah.name} />
        <span>{madrasah.name}</span>
      </span>
    }
    footer={
      madrasah.courseCount > 0 ? (
        <span>
          {t("DiscoverPage.coursesCount", { count: madrasah.courseCount })}
        </span>
      ) : null
    }
  >
    {madrasah.headMuderrisName ? (
      <p className="mds-card__body">
        {t("DiscoverPage.headMuderris", { name: madrasah.headMuderrisName })}
      </p>
    ) : null}
    {madrasah.courses.length === 0 ? (
      <p className="mds-card__body grow">
        {t("DiscoverPage.madrasahNoCourses")}
      </p>
    ) : (
      <ul className="mbs-4 flex grow flex-col gap-3">
        {madrasah.courses.map((course) => (
          <li key={course.id} className="flex items-center gap-3">
            <CoverPattern seed={course.id} size="xs" aria-hidden="true" />
            <Link href={`/courses/${course.id}`} className="relative z-10">
              <bdi>{course.title}</bdi>
            </Link>
          </li>
        ))}
      </ul>
    )}
  </Card>
);
