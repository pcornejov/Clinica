/**
 * La agenda se define en hora de Chile, pero la base de datos guarda instantes
 * (timestamptz). Estas funciones convierten entre ambos considerando el cambio
 * de horario de invierno/verano.
 */

export const ZONA_HORARIA = "America/Santiago";

function partesEnZona(instante: Date, zona: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return {
    anio: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
    segundo: valor("second"),
  };
}

/** Diferencia en minutos entre la hora local de `zona` y UTC en ese instante. */
function desfaseMinutos(instante: Date, zona: string): number {
  const p = partesEnZona(instante, zona);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return Math.round((comoUtc - instante.getTime()) / 60_000);
}

/** Convierte una fecha ("2026-10-20") y hora ("09:30") de Chile a un instante. */
export function aInstante(fecha: string, hora: string, zona = ZONA_HORARIA): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  const supuesto = Date.UTC(anio, mes - 1, dia, h, m);
  const desfase1 = desfaseMinutos(new Date(supuesto), zona);
  let resultado = supuesto - desfase1 * 60_000;
  const desfase2 = desfaseMinutos(new Date(resultado), zona);
  if (desfase2 !== desfase1) resultado = supuesto - desfase2 * 60_000;
  return new Date(resultado);
}

/** Fecha local "YYYY-MM-DD" de un instante. */
export function fechaLocal(instante: Date, zona = ZONA_HORARIA): string {
  const p = partesEnZona(instante, zona);
  return `${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** Día de la semana local (0 = domingo … 6 = sábado). */
export function diaSemanaLocal(instante: Date, zona = ZONA_HORARIA): number {
  const [anio, mes, dia] = fechaLocal(instante, zona).split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

/** Suma días a una fecha "YYYY-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function formatearFechaHora(instante: Date, zona = ZONA_HORARIA): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: zona,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instante);
}

export function formatearHora(instante: Date, zona = ZONA_HORARIA): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instante);
}

export function formatearPesos(monto: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(monto);
}
