import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ARCHIVE_ITEM_TYPES, ArchiveItemType } from "./archive-types";

/** `types=week,session`: a comma-separated list of archive types, none for all. */
export class ArchiveTypesPipe
  implements PipeTransform<unknown, ArchiveItemType[] | undefined>
{
  transform(value: unknown): ArchiveItemType[] | undefined {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const types = value.split(",").map((t) => t.trim());
    const unknown = types.filter(
      (t) => !(ARCHIVE_ITEM_TYPES as readonly string[]).includes(t)
    );
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Validation failed (unknown archive type: ${unknown.join(", ")})`
      );
    }
    return types as ArchiveItemType[];
  }
}
