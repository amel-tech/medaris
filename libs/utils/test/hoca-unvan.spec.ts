import {
  formatHocaName,
  HOCA_UNVAN_PREFIX,
  HOCA_UNVANS,
  isHocaUnvan,
} from "../src/hoca-unvan";

describe("formatHocaName — a hoca's name with the unvan of one course", () => {
  it.each([
    ["PROF_DR", "Prof. Dr. Ahmet Mehmet"],
    ["DOC_DR", "Doç. Dr. Ahmet Mehmet"],
    ["DR", "Dr. Ahmet Mehmet"],
    ["MUDERRIS", "Müderris Ahmet Mehmet"],
    ["MOLLA", "Molla Ahmet Mehmet"],
    ["MUFTU", "Müftü Ahmet Mehmet"],
    ["SEYH", "Şeyh Ahmet Mehmet"],
    ["HAFIZ", "Hafız Ahmet Mehmet"],
  ])("puts %s before the name", (unvan, shown) => {
    expect(formatHocaName("Ahmet Mehmet", unvan)).toBe(shown);
  });

  it("covers every code", () => {
    expect([...HOCA_UNVANS].sort()).toEqual(
      Object.keys(HOCA_UNVAN_PREFIX).sort()
    );
  });

  it.each([
    [null],
    [undefined],
  ])("writes Hoca after the name when the unvan is %s", (unvan) => {
    expect(formatHocaName("Ahmet Mehmet", unvan)).toBe("Ahmet Mehmet Hoca");
  });

  it("reads a code it does not know as no unvan", () => {
    expect(formatHocaName("Ahmet Mehmet", "SULTAN")).toBe("Ahmet Mehmet Hoca");
    expect(formatHocaName("Ahmet Mehmet", "")).toBe("Ahmet Mehmet Hoca");
    expect(formatHocaName("Ahmet Mehmet", "prof_dr")).toBe("Ahmet Mehmet Hoca");
  });

  it("trims the name", () => {
    expect(formatHocaName("  Ahmet Mehmet ", "MOLLA")).toBe(
      "Molla Ahmet Mehmet"
    );
    expect(formatHocaName("  Ahmet Mehmet ", null)).toBe("Ahmet Mehmet Hoca");
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   "],
  ])("gives an empty string for the name %j, never a bare unvan", (name) => {
    expect(formatHocaName(name, null)).toBe("");
    expect(formatHocaName(name, "PROF_DR")).toBe("");
  });
});

describe("isHocaUnvan", () => {
  it("accepts the codes and nothing else", () => {
    for (const code of HOCA_UNVANS) expect(isHocaUnvan(code)).toBe(true);
    expect(isHocaUnvan(null)).toBe(false);
    expect(isHocaUnvan("HOCA")).toBe(false);
    expect(isHocaUnvan(1)).toBe(false);
  });
});
