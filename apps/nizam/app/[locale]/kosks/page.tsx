import { getManagedKosks, getMe } from "~/features/kosks/actions";
import { KosksPage } from "~/features/kosks/components/kosks-page";
import {
  koskListEmptyState,
  taughtElsewhere,
} from "~/features/kosks/kosk-abilities";

const PAGE_SIZE = 12;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ items, total, limit }, me] = await Promise.all([
    getManagedKosks(page, PAGE_SIZE),
    getMe(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <KosksPage
      kosks={items}
      page={page}
      totalPages={totalPages}
      emptyState={koskListEmptyState(me)}
      taughtCourses={taughtElsewhere(me)}
    />
  );
}
