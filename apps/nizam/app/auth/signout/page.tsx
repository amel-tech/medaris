import { SignOutConfirm } from "~/features/auth/sign-out-confirm";

/** The sign-out confirmation (MDRS-101), public in `lib/public-paths.ts`. */
export default async function SignOutPage() {
  return <SignOutConfirm />;
}
