import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { NotFoundState } from "~/features/errors/system-page";

/** Design tedris/38: every `notFound()` under `[locale]` and every unknown URL, under the system's bar. */
export default function NotFound() {
  return (
    <>
      <PhoneChrome section={null} />
      <NotFoundState />
    </>
  );
}
