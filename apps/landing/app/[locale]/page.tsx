import { setRequestLocale } from "next-intl/server";
import { CurriculumSection } from "~/features/curriculum";
import { FeaturesSection } from "~/features/features";
import { FooterSection } from "~/features/footer";
import { HeaderSection } from "~/features/header";
import { HeroSection } from "~/features/hero";
import { PartnershipSection } from "~/features/partnership";
import { VisionSection } from "~/features/vision";
import { WaitlistSection } from "~/features/waitlist";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-background-light text-gray-800 font-sans">
      <HeaderSection />
      <HeroSection />
      <div className="geometric-divider" />
      <section id="vision">
        <VisionSection />
      </section>
      <div className="geometric-divider" />
      <section id="features">
        <FeaturesSection />
      </section>
      <div className="geometric-divider" />
      <section id="curriculum">
        <CurriculumSection />
      </section>
      <div className="geometric-divider" />
      <section id="partnership">
        <PartnershipSection />
      </section>
      <WaitlistSection />
      <FooterSection />
    </div>
  );
}
