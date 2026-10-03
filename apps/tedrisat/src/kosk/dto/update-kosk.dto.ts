import { OmitType, PartialType } from "@nestjs/swagger";
import { CreateKoskDto } from "./create-kosk.dto";

/**
 * Every field optional, none of the NOT NULL ones nullable (MDRS-108).
 * `skipNullProperties: false` makes `PartialType` add
 * `ValidateIf(value !== undefined)` instead of `@IsOptional()`, so
 * `{"name": null}` is validated — and refused with 400 — rather than reaching
 * Postgres as a 500. The nullable columns (handle, description, field, level)
 * keep their own `@IsOptional()` from `CreateKoskDto`, where null clears them.
 *
 * The first nazımları are not a köşk's own setting (nizam/25 lists them
 * read-only), so `managerUserIds` is left out of the update.
 */
export class UpdateKoskDto extends PartialType(
  OmitType(CreateKoskDto, ["managerUserIds"] as const),
  { skipNullProperties: false }
) {}
