import { aInstante, sumarDias } from "~/lib/fechas";

export type HorarioBase = {
  medicoId: string;
  especialidadId: string | null;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  duracionMinutos: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
};

export type Intervalo = { inicio: Date; fin: Date };

export type Cupo = { medicoId: string; inicio: Date; fin: Date };

/** Día de la semana (0 = domingo) de una fecha "YYYY-MM-DD", sin depender de la zona horaria. */
export function diaSemanaDeFecha(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function seCruza(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

/**
 * Genera los cupos de un médico en un rango de fechas a partir de sus horarios
 * semanales, descontando citas ocupadas, bloqueos y lo que ya pasó.
 *
 * - `ocupados`: citas activas que consumen cupo (no canceladas, no "no asistió",
 *   no sobrecupos).
 * - `desdeInstante`: no se ofrecen cupos que empiecen antes (ahora + anticipación).
 */
export function generarCupos(opciones: {
  horarios: HorarioBase[];
  ocupados: Intervalo[];
  bloqueos: Intervalo[];
  desde: string;
  hasta: string;
  desdeInstante: Date;
  especialidadId?: string;
}): Cupo[] {
  const { horarios, ocupados, bloqueos, desde, hasta, desdeInstante, especialidadId } = opciones;
  const cupos: Cupo[] = [];

  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    const dia = diaSemanaDeFecha(fecha);
    for (const h of horarios) {
      if (h.diaSemana !== dia) continue;
      if (fecha < h.vigenteDesde || (h.vigenteHasta && fecha > h.vigenteHasta)) continue;
      if (especialidadId && h.especialidadId && h.especialidadId !== especialidadId) continue;

      const duracionMs = h.duracionMinutos * 60_000;
      const finBloque = aInstante(fecha, h.horaFin.slice(0, 5)).getTime();
      for (
        let t = aInstante(fecha, h.horaInicio.slice(0, 5)).getTime();
        t + duracionMs <= finBloque;
        t += duracionMs
      ) {
        const cupo = { medicoId: h.medicoId, inicio: new Date(t), fin: new Date(t + duracionMs) };
        if (cupo.inicio < desdeInstante) continue;
        if (ocupados.some((o) => seCruza(cupo, o))) continue;
        if (bloqueos.some((b) => seCruza(cupo, b))) continue;
        cupos.push(cupo);
      }
    }
  }
  return cupos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
