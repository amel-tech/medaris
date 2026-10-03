import { FormSkeleton } from "~/features/account/components/form-skeleton";

/** Köşk açma başvurusu while the account's address is read (MDRS-166). */
export default function Loading() {
  return <FormSkeleton cards={1} />;
}
