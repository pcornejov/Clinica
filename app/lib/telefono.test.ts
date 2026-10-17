import { describe, expect, it } from "vitest";
import { formatearTelefono, normalizarTelefono } from "./telefono";

describe("telefono", () => {
  it("normaliza celulares chilenos en distintos formatos", () => {
    expect(normalizarTelefono("912345678")).toBe("+56912345678");
    expect(normalizarTelefono("+56 9 1234 5678")).toBe("+56912345678");
    expect(normalizarTelefono("56-9-1234-5678")).toBe("+56912345678");
    expect(normalizarTelefono("22345678 9")).toBe("+56223456789");
  });
  it("rechaza números inválidos", () => {
    expect(normalizarTelefono("12345")).toBeNull();
    expect(normalizarTelefono("812345678")).toBeNull();
  });
  it("formatea para mostrar", () => {
    expect(formatearTelefono("+56912345678")).toBe("+56 9 1234 5678");
  });
});
