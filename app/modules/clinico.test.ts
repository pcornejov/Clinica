import { describe, expect, it } from "vitest";
import { edad, imc } from "./clinico";

describe("ficha clínica", () => {
  it("calcula la edad considerando si ya fue el cumpleaños", () => {
    const hoy = new Date(2026, 9, 17); // 17 de octubre de 2026
    expect(edad("1985-03-12", hoy)).toBe(41);
    expect(edad("1985-10-18", hoy)).toBe(40);
    expect(edad("1985-10-17", hoy)).toBe(41);
    expect(edad(null, hoy)).toBeNull();
  });
  it("calcula el IMC con un decimal", () => {
    expect(imc(70, 175)).toBe(22.9);
    expect(imc(undefined, 175)).toBeNull();
  });
});
