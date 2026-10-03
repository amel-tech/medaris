import {
  HIDE_RANK,
  type HideLevel,
  hiderLevelOf,
  lowestHidingLevel,
  mayRestoreAt,
} from "../../../src/archive/hide-level";

const LEVELS: HideLevel[] = ["course", "madrasah", "kosk", "platform"];

describe("the kademe of a hide (MDRS-135)", () => {
  it("ranks the levels as the bans do: course < medrese < köşk < platform", () => {
    expect(LEVELS.map((level) => HIDE_RANK[level])).toEqual([1, 2, 3, 4]);
  });

  it.each(
    LEVELS.flatMap((hider) => LEVELS.map((restorer) => [hider, restorer]))
  )("a hide at %s is restored by %s only at or above it", (hider, restorer) => {
    expect(mayRestoreAt(restorer as HideLevel, hider as HideLevel)).toBe(
      LEVELS.indexOf(restorer as HideLevel) >=
        LEVELS.indexOf(hider as HideLevel)
    );
  });

  it("counts a row with no level as the lowest level that could have hidden it", () => {
    expect(lowestHidingLevel({ type: "madrasah", madrasahId: "m" })).toBe(
      "madrasah"
    );
    expect(lowestHidingLevel({ type: "course", madrasahId: "m" })).toBe(
      "madrasah"
    );
    expect(lowestHidingLevel({ type: "course", madrasahId: null })).toBe(
      "kosk"
    );
    for (const type of ["week", "session", "recording"] as const) {
      expect(lowestHidingLevel({ type, madrasahId: "m" })).toBe("course");
    }
    expect(lowestHidingLevel({ type: "deck", madrasahId: null })).toBe("kosk");
    expect(lowestHidingLevel({ type: "kosk", madrasahId: null })).toBe("kosk");
  });

  it("takes the recorded level over the derived one", () => {
    expect(
      hiderLevelOf({ type: "course", madrasahId: "m", archivedLevel: "kosk" })
    ).toBe("kosk");
    expect(
      hiderLevelOf({ type: "course", madrasahId: "m", archivedLevel: null })
    ).toBe("madrasah");
  });
});
