import { generateSigas } from "@medaris/sarf";
import { describe, expect, it } from "vitest";
import { sigaDraftProblems } from "~/features/decks/siga";

describe("sigaDraftProblems", () => {
  it("names the drafts with a face shorter than 3 or longer than 5000", () => {
    const drafts =
      generateSigas({
        root: "ن ص ر",
        bab: "nasara",
        kips: ["mazi"],
        maziMeaning: "yardım etti",
        muzariMeaning: "",
      }) ?? [];
    expect(sigaDraftProblems(drafts)).toEqual([]);
    const [third, sixth] = [drafts[2], drafts[5]];
    if (!third || !sixth) throw new Error("fourteen drafts expected");
    drafts[2] = { ...third, contentBack: "  " };
    drafts[5] = { ...sixth, contentFront: "x".repeat(5001) };
    expect(sigaDraftProblems(drafts)).toEqual([2, 5]);
  });
});
