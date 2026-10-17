/** Convierte "HH:MM" o "HH:MM:SS" a minutos desde la medianoche. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

type Bloque = { diaSemana: number; horaInicio: string; horaFin: string };

/** Dos bloques semanales se superponen si son el mismo día y sus rangos se cruzan. */
export function bloquesSeSuperponen(a: Bloque, b: Bloque): boolean {
  if (a.diaSemana !== b.diaSemana) return false;
  return aMinutos(a.horaInicio) < aMinutos(b.horaFin) && aMinutos(b.horaInicio) < aMinutos(a.horaFin);
}

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Orden de presentación: lunes primero. */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
