import { ConflictError } from "@medaris/common";
import type { PassivationImpactResponse } from "./dto/passivation.dto";

/**
 * The numbers the person confirmed are not the numbers any more, or the token
 * was made for someone else (MDRS-227). Nothing was written. The fresh preview
 * rides in `context.impact`, so the screen shows it without a second call and
 * the person reads it before confirming again.
 */
export class PassivationImpactChangedError extends ConflictError {
  static readonly code = "PASSIVATION_IMPACT_CHANGED";

  constructor(impact: PassivationImpactResponse) {
    super(
      PassivationImpactChangedError.code,
      "What passivating takes along changed since the preview; read it again and confirm again",
      { impact }
    );
  }
}
