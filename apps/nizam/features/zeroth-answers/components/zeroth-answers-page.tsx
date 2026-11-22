import { forbidden } from "next/navigation";
import { parseZerothFilters } from "../present";
import { getZerothAnswerCounts, getZerothQuestionExams } from "../reads";
import { ZerothAnswersView } from "./zeroth-answers-view";

/**
 * The server half of Sıfırıncı soru cevapları (MDRS-299): reads the list,
 * and the question the address opens, under the filters of the address.
 * A köşk nazımı's page is their köşk's (`kosk`); platform management's reads
 * every köşk. A refusal shows "Bu bölüm için izniniz yok" (nizam/06).
 */
export async function ZerothAnswersPage({
  kosk,
  searchParams,
}: {
  kosk: { id: string; name: string } | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parseZerothFilters(searchParams);
  const [list, detail] = await Promise.all([
    getZerothAnswerCounts(filters, kosk?.id),
    filters.question
      ? getZerothQuestionExams(filters.question, filters, kosk?.id)
      : Promise.resolve(null),
  ]);
  if (list === "forbidden" || detail === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[72rem] px-gutter py-8">
      {/* keyed by the address: new filters start from what they read */}
      <ZerothAnswersView
        key={JSON.stringify(filters)}
        kosk={kosk}
        filters={filters}
        list={list === "gone" ? null : list}
        detail={detail}
      />
    </div>
  );
}
