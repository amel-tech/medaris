import { describe, expect, it } from "vitest";
import { placePopup } from "~/features/courses/popup-placement";

/**
 * Where the Müfredat combobox opens (MDRS-289): "tıklayınca dropdown açılsın
 * (aşağıda yer yoksa yukarıda)". The component measures the button's rect,
 * the window and the popup's height; this is the rule it applies to them.
 */
describe("placePopup (MDRS-289)", () => {
  // A 900 px window less an 8 px margin each side, the popup 8 px off the button.
  const viewport = { top: 8, bottom: 892 };
  const gap = 8;
  const at = (top: number, height = 480) =>
    placePopup({ anchor: { top, bottom: top + 80 }, viewport, height, gap });

  it("opens below when the popup fits there", () => {
    expect(at(100)).toEqual({ side: "below", room: 892 - 180 - 8 });
  });

  it("opens above when there is no room below, as at the foot of the page", () => {
    expect(at(780)).toEqual({ side: "above", room: 780 - 8 - 8 });
  });

  it("stays below when it fits there exactly, and goes above a pixel short", () => {
    // from a button at 500: 892 - 580 - 8 = 304 below, 500 - 16 = 484 above
    expect(at(500, 304)).toEqual({ side: "below", room: 304 });
    expect(at(500, 305)).toEqual({ side: "above", room: 484 });
  });

  it("takes the side with more room when it fits on neither, capped to that room", () => {
    // a short window: 300 px of room above, 196 below
    const short = { top: 8, bottom: 600 };
    expect(
      placePopup({
        anchor: { top: 316, bottom: 396 },
        viewport: short,
        height: 480,
        gap,
      })
    ).toEqual({ side: "above", room: 300 });
    expect(
      placePopup({
        anchor: { top: 100, bottom: 180 },
        viewport: short,
        height: 480,
        gap,
      })
    ).toEqual({ side: "below", room: 412 });
  });

  it("never gives a negative room", () => {
    expect(
      placePopup({
        anchor: { top: 0, bottom: 80 },
        viewport: { top: 8, bottom: 50 },
        height: 480,
        gap,
      })
    ).toEqual({ side: "above", room: 0 });
  });
});
