import { getTranslations } from "next-intl/server";
import { LoadFailed } from "~/features/kosks/components/load-failed";

/** The API did not answer: said in place, with a retry, not as a missing right. */
export async function CourseLoadFailed() {
  const t = await getTranslations("nizam.CourseLoad");
  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <LoadFailed
        title={t("title")}
        message={t("message")}
        retry={t("retry")}
      />
    </div>
  );
}
