import { NotFoundState } from "~/features/errors/system-page";

/** Design tedris/38: every `notFound()` under `[locale]` and every unknown URL. */
export default function NotFound() {
  return <NotFoundState />;
}
