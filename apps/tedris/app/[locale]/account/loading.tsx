import { FormSkeleton } from "~/features/account/components/form-skeleton";

/** Hesap and Herkese açık profil while their reads are in flight (MDRS-166). */
export default function Loading() {
  return <FormSkeleton />;
}
