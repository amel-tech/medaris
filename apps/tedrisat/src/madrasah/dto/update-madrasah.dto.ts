import { OmitType, PartialType } from "@nestjs/swagger";
import { CreateMadrasahDto } from "./create-madrasah.dto";

/** Who heads the medrese is `PUT /madrasahs/:id/head-muderris`, not a field here. */
export class UpdateMadrasahDto extends PartialType(
  OmitType(CreateMadrasahDto, ["headMuderrisUserId"] as const)
) {}
