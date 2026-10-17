import { describe, expect, it } from "vitest";
import { aInstante } from "~/lib/fechas";
import { diaSemanaDeFecha, generarCupos, type HorarioBase } from "./disponibilidad";

// 2026-11-02 es lunes.
const LUNES = "2026-11-02";
const horario = (extra: Partial<HorarioBase> = {}): HorarioBase => ({
  medicoId: "m1",
  especialidadId: "e1",
  diaSemana: 1,
  horaInicio: "09:00:00",
  horaFin: "11:00:00",
  duracionMinutos: 30,
  vigenteDesde: "2026-01-01",
  vigenteHasta: null,
  ...extra,
});
const base = {
  ocupados: [],
  bloqueos: [],
  desde: LUNES,
  hasta: LUNES,
  desdeInstante: new Date("2026-01-01T00:00:00Z"),
};
const horas = (cupos: { inicio: Date }[]) =>
  cupos.map((c) => c.inicio.toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));

describe("generarCupos", () => {
  it("calcula el día de la semana de una fecha", () => {
    expect(diaSemanaDeFecha(LUNES)).toBe(1);
    expect(diaSemanaDeFecha("2026-11-08")).toBe(0);
  });

  it("divide el bloque en cupos de la duración indicada", () => {
    const cupos = generarCupos({ ...base, horarios: [horario()] });
    expect(horas(cupos)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("descarta el último cupo si no cabe completo", () => {
    const cupos = generarCupos({ ...base, horarios: [horario({ horaFin: "10:45:00" })] });
    expect(horas(cupos)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("solo genera cupos el día de la semana del horario", () => {
    const cupos = generarCupos({ ...base, hasta: "2026-11-15", horarios: [horario()] });
    expect(cupos).toHaveLength(8); // dos lunes × 4 cupos
  });

  it("descuenta citas ocupadas, incluidas las que se cruzan parcialmente", () => {
    const ocupados = [
      { inicio: aInstante(LUNES, "09:30"), fin: aInstante(LUNES, "10:00") },
      { inicio: aInstante(LUNES, "10:15"), fin: aInstante(LUNES, "10:45") },
    ];
    const cupos = generarCupos({ ...base, ocupados, horarios: [horario()] });
    expect(horas(cupos)).toEqual(["09:00"]);
  });

  it("descuenta bloqueos de agenda", () => {
    const bloqueos = [{ inicio: aInstante(LUNES, "00:00"), fin: aInstante(LUNES, "10:00") }];
    const cupos = generarCupos({ ...base, bloqueos, horarios: [horario()] });
    expect(horas(cupos)).toEqual(["10:00", "10:30"]);
  });

  it("no ofrece cupos anteriores al instante mínimo (anticipación)", () => {
    const cupos = generarCupos({ ...base, desdeInstante: aInstante(LUNES, "09:45"), horarios: [horario()] });
    expect(horas(cupos)).toEqual(["10:00", "10:30"]);
  });

  it("respeta la vigencia del horario", () => {
    expect(generarCupos({ ...base, horarios: [horario({ vigenteDesde: "2026-11-03" })] })).toHaveLength(0);
    expect(generarCupos({ ...base, horarios: [horario({ vigenteHasta: "2026-11-01" })] })).toHaveLength(0);
  });

  it("filtra por especialidad cuando el horario la indica", () => {
    const horarios = [horario(), horario({ especialidadId: "e2", horaInicio: "15:00:00", horaFin: "16:00:00" })];
    expect(generarCupos({ ...base, horarios, especialidadId: "e2" })).toHaveLength(2);
    expect(generarCupos({ ...base, horarios })).toHaveLength(6);
  });

  it("genera las horas correctas en el día del cambio de horario", () => {
    // El 2026-09-06 (domingo) Chile pasa a horario de verano; el lunes siguiente ya es UTC-3.
    const cupos = generarCupos({ ...base, desde: "2026-09-07", hasta: "2026-09-07", horarios: [horario()] });
    expect(cupos[0].inicio.toISOString()).toBe("2026-09-07T12:00:00.000Z");
  });

  it("ordena los cupos de varios médicos por hora", () => {
    const horarios = [horario(), horario({ medicoId: "m2", horaInicio: "09:15:00", horaFin: "10:15:00" })];
    const cupos = generarCupos({ ...base, horarios });
    expect(cupos.slice(0, 3).map((c) => c.medicoId)).toEqual(["m1", "m2", "m1"]);
  });
});
