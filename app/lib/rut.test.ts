import { describe, expect, it } from "vitest";
import { calcularDv, formatearRut, normalizarRut, validarRut } from "./rut";

describe("rut", () => {
  it("calcula el dígito verificador", () => {
    expect(calcularDv("12345678")).toBe("5");
    expect(calcularDv("11111111")).toBe("1");
    expect(calcularDv("10000013")).toBe("K");
    expect(calcularDv("10000004")).toBe("0");
  });

  it("valida RUT con y sin formato", () => {
    expect(validarRut("12.345.678-5")).toBe(true);
    expect(validarRut("123456785")).toBe(true);
    expect(validarRut("10.000.013-k")).toBe(true);
    expect(validarRut("12.345.678-9")).toBe(false);
    expect(validarRut("1-9")).toBe(false);
    expect(validarRut("")).toBe(false);
  });

  it("normaliza y formatea", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut("10000013k")).toBe("10000013-K");
    expect(normalizarRut("12345678-9")).toBeNull();
    expect(formatearRut("123456785")).toBe("12.345.678-5");
    expect(formatearRut("9876543-3")).toBe("9.876.543-3");
  });
});
