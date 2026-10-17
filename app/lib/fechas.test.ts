import { describe, expect, it } from "vitest";
import { aInstante, diaSemanaLocal, fechaLocal, sumarDias } from "./fechas";

describe("fechas", () => {
  it("convierte hora de Chile en invierno (UTC-4)", () => {
    expect(aInstante("2026-07-15", "09:00").toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("convierte hora de Chile en verano (UTC-3)", () => {
    expect(aInstante("2026-12-15", "09:00").toISOString()).toBe("2026-12-15T12:00:00.000Z");
  });

  it("obtiene fecha y día de la semana locales", () => {
    // 02:00 UTC del 16 corresponde todavía al 15 en Chile.
    const instante = new Date("2026-07-16T02:00:00Z");
    expect(fechaLocal(instante)).toBe("2026-07-15");
    expect(diaSemanaLocal(instante)).toBe(3); // miércoles
  });

  it("suma días cruzando meses", () => {
    expect(sumarDias("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("formato", () => {
  it("pone mayúscula solo a la primera letra", async () => {
    const { formatearDia, formatearFechaHora } = await import("./fechas");
    expect(formatearDia("2026-11-03")).toBe("Martes, 3 de noviembre");
    expect(formatearFechaHora(new Date("2026-11-03T12:30:00Z"))).toBe("Martes, 3 de noviembre, 09:30");
  });
});
