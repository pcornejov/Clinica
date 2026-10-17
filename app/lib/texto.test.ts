import { describe, expect, it } from "vitest";
import { slugify } from "./texto";

describe("slugify", () => {
  it("quita tildes, espacios y símbolos", () => {
    expect(slugify("Medicina General")).toBe("medicina-general");
    expect(slugify("  Ginecología & Obstetricia ")).toBe("ginecologia-obstetricia");
    expect(slugify("Niño sano (0–5 años)")).toBe("nino-sano-0-5-anos");
  });
});
