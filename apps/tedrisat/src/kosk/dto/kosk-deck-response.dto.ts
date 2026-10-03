import { ApiProperty } from "@nestjs/swagger";

export class KoskDeckResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ example: "Sarfın temel kelimeleri" }) title!: string;
  @ApiProperty({ example: 60, description: "Cards in the deck" })
  cardCount!: number;
  @ApiProperty({
    description: "Whether the caller has the deck in their collection",
  })
  inCollection!: boolean;
}

export class KoskDecksResponse {
  @ApiProperty({
    description:
      "False for a caller who is neither a talebe, a müderris nor a manager of the köşk: the köşk page then leaves the block out.",
  })
  accessible!: boolean;

  @ApiProperty({ type: KoskDeckResponse, isArray: true })
  decks!: KoskDeckResponse[];
}
