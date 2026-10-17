import { describe, expect, it } from "vitest";
import { nombreSeguro, tipoReal } from "./archivos.server";

describe("archivos", () => {
  it("reconoce el tipo real por los primeros bytes", () => {
    expect(tipoReal(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(tipoReal(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(tipoReal(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });
  it("rechaza otros tipos aunque tengan extensión permitida", () => {
    expect(tipoReal(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(tipoReal(new TextEncoder().encode("MZ"))).toBeNull();
  });
  it("limpia nombres de archivo", () => {
    expect(nombreSeguro('../../etc/"passwd".pdf')).toBe(".._.._etc__passwd_.pdf");
    expect(nombreSeguro("Hemograma Pérez.pdf")).toBe("Hemograma Pérez.pdf");
  });
});
