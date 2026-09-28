import { PartialType } from "@nestjs/swagger";
import { CreateMadrasahDto } from "./create-madrasah.dto";

export class UpdateMadrasahDto extends PartialType(CreateMadrasahDto) {}
