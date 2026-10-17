import { describe, expect, it } from "vitest";
import { aMinutos, bloquesSeSuperponen } from "./horarios";

const lunes = (horaInicio: string, horaFin: string) => ({ diaSemana: 1, horaInicio, horaFin });

describe("horarios", () => {
  it("convierte horas a minutos", () => {
    expect(aMinutos("09:30")).toBe(570);
    expect(aMinutos("14:00:00")).toBe(840);
  });

  it("detecta bloques que se cruzan", () => {
    expect(bloquesSeSuperponen(lunes("09:00", "13:00"), lunes("12:00", "15:00"))).toBe(true);
    expect(bloquesSeSuperponen(lunes("09:00", "13:00"), lunes("10:00", "11:00"))).toBe(true);
  });

  it("permite bloques contiguos o de otro día", () => {
    expect(bloquesSeSuperponen(lunes("09:00", "13:00"), lunes("13:00", "17:00"))).toBe(false);
    expect(bloquesSeSuperponen(lunes("09:00", "13:00"), { ...lunes("09:00", "13:00"), diaSemana: 2 })).toBe(false);
  });
});
