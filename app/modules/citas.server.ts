import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, notInArray, or } from "drizzle-orm";
import { clinica } from "~/config/clinica";
import type { Db } from "~/db/client";
import {
  bloqueosAgenda,
  citas,
  especialidades,
  horariosMedico,
  listaEspera,
  medicoEspecialidades,
  medicos,
  notificaciones,
} from "~/db/schema";
import { aInstante, fechaLocal, sumarDias } from "~/lib/fechas";
import { programarAvisosCita } from "./avisos/programar.server";
import { generarCupos, type Cupo } from "./disponibilidad";

/** Estados que liberan la hora (el resto la ocupa). */
const ESTADOS_LIBERAN = ["cancelada", "no_asistio"] as const;
/** Estados en que el paciente todavía puede anular o reagendar. */
export const ESTADOS_GESTIONABLES = ["pendiente_pago", "agendada", "confirmada"] as const;

export type Medico = typeof medicos.$inferSelect;

/**
 * Horas disponibles de una especialidad (y opcionalmente de un médico) entre
 * dos fechas locales. `desdeInstante` controla desde cuándo se ofrecen horas:
 * en la web es ahora + la anticipación mínima; en recepción, el inicio del día.
 */
export async function buscarCupos(
  db: Db,
  filtro: {
    especialidadId: string;
    medicoId?: string;
    soloFonasa?: boolean;
    desde: string;
    hasta: string;
    desdeInstante?: Date;
    /** Cita que se está reagendando: su hora actual no cuenta como ocupada. */
    excluirCitaId?: string;
  },
): Promise<{ cupos: Cupo[]; medicos: Medico[] }> {
  const condiciones = [
    eq(medicoEspecialidades.especialidadId, filtro.especialidadId),
    eq(medicos.activo, true),
    eq(especialidades.activa, true),
  ];
  if (filtro.medicoId) condiciones.push(eq(medicos.id, filtro.medicoId));
  if (filtro.soloFonasa) condiciones.push(eq(medicos.atiendeFonasa, true));

  const lista = (
    await db
      .select({ medico: medicos })
      .from(medicos)
      .innerJoin(medicoEspecialidades, eq(medicoEspecialidades.medicoId, medicos.id))
      .innerJoin(especialidades, eq(especialidades.id, medicoEspecialidades.especialidadId))
      .where(and(...condiciones))
      .orderBy(asc(medicos.apellidos))
  ).map((f) => f.medico);
  if (lista.length === 0) return { cupos: [], medicos: [] };

  const ids = lista.map((m) => m.id);
  const inicioRango = aInstante(filtro.desde, "00:00");
  const finRango = aInstante(sumarDias(filtro.hasta, 1), "00:00");

  const condicionesCitas = [
    inArray(citas.medicoId, ids),
    lt(citas.inicio, finRango),
    gt(citas.fin, inicioRango),
    notInArray(citas.estado, [...ESTADOS_LIBERAN]),
    eq(citas.sobrecupo, false),
  ];
  if (filtro.excluirCitaId) condicionesCitas.push(ne(citas.id, filtro.excluirCitaId));

  const [horarios, ocupadas, bloqueos] = await Promise.all([
    db.select().from(horariosMedico).where(inArray(horariosMedico.medicoId, ids)),
    db.select({ medicoId: citas.medicoId, inicio: citas.inicio, fin: citas.fin }).from(citas).where(and(...condicionesCitas)),
    db
      .select({ medicoId: bloqueosAgenda.medicoId, inicio: bloqueosAgenda.inicio, fin: bloqueosAgenda.fin })
      .from(bloqueosAgenda)
      .where(and(inArray(bloqueosAgenda.medicoId, ids), lt(bloqueosAgenda.inicio, finRango), gt(bloqueosAgenda.fin, inicioRango))),
  ]);

  const desdeInstante =
    filtro.desdeInstante ?? new Date(Date.now() + clinica.reglas.anticipacionMinimaHoras * 3_600_000);

  const cupos = ids.flatMap((medicoId) =>
    generarCupos({
      horarios: horarios.filter((h) => h.medicoId === medicoId),
      ocupados: ocupadas.filter((o) => o.medicoId === medicoId),
      bloqueos: bloqueos.filter((b) => b.medicoId === medicoId),
      desde: filtro.desde,
      hasta: filtro.hasta,
      desdeInstante,
      especialidadId: filtro.especialidadId,
    }),
  );
  cupos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  return { cupos, medicos: lista };
}

/** Último día que se puede agendar en la web. */
export function ultimoDiaAgendable(): string {
  return sumarDias(fechaLocal(new Date()), clinica.reglas.diasAgendaVisible);
}

export type ErrorCita = { error: string };

function esConflictoHorario(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23P01" || e?.cause?.code === "23P01";
}

/**
 * Crea una cita validando en el servidor que la hora exista y esté libre.
 * La restricción de la base de datos es la última línea de defensa si dos
 * personas toman la misma hora al mismo tiempo.
 */
export async function crearCita(
  db: Db,
  datos: {
    pacienteId: string;
    medicoId: string;
    especialidadId: string;
    inicio: Date;
    canal: "web" | "recepcion" | "whatsapp";
    motivoConsulta?: string | null;
    requiereRevision?: boolean;
    /** Solo recepción: fuera de los cupos normales. */
    sobrecupo?: boolean;
    /** Recepción puede agendar horas del mismo día sin anticipación mínima. */
    desdeInstante?: Date;
    /**
     * Pago online: la hora queda retenida como "pendiente de pago" durante
     * unos minutos; si no se paga, el cron la libera.
     */
    pagoOnline?: boolean;
  },
): Promise<{ citaId: string } | ErrorCita> {
  if (datos.pagoOnline && !clinica.modulos.pagoOnline) return { error: "El pago en línea no está disponible." };
  const [especialidad] = await db.select().from(especialidades).where(eq(especialidades.id, datos.especialidadId));
  if (!especialidad?.activa) return { error: "La especialidad no está disponible." };

  let fin: Date;
  if (datos.sobrecupo) {
    fin = new Date(datos.inicio.getTime() + especialidad.duracionMinutos * 60_000);
  } else {
    const fecha = fechaLocal(datos.inicio);
    const { cupos } = await buscarCupos(db, {
      especialidadId: datos.especialidadId,
      medicoId: datos.medicoId,
      desde: fecha,
      hasta: fecha,
      desdeInstante: datos.desdeInstante,
    });
    const cupo = cupos.find((c) => c.inicio.getTime() === datos.inicio.getTime());
    if (!cupo) return { error: "Esa hora ya no está disponible. Por favor elige otra." };
    fin = cupo.fin;
  }

  const [cruce] = await db
    .select({ id: citas.id })
    .from(citas)
    .where(
      and(
        eq(citas.pacienteId, datos.pacienteId),
        notInArray(citas.estado, [...ESTADOS_LIBERAN]),
        lt(citas.inicio, fin),
        gt(citas.fin, datos.inicio),
      ),
    );
  if (cruce) return { error: "El paciente ya tiene otra cita a esa misma hora." };

  try {
    const [cita] = await db
      .insert(citas)
      .values({
        pacienteId: datos.pacienteId,
        medicoId: datos.medicoId,
        especialidadId: datos.especialidadId,
        inicio: datos.inicio,
        fin,
        estado: datos.pagoOnline ? "pendiente_pago" : "agendada",
        canal: datos.canal,
        modalidadPago: datos.pagoOnline ? "online" : "clinica",
        reservaExpiraEn: datos.pagoOnline ? new Date(Date.now() + clinica.reglas.reservaPagoMinutos * 60_000) : null,
        precio: especialidad.precio,
        sobrecupo: datos.sobrecupo ?? false,
        motivoConsulta: datos.motivoConsulta ?? null,
        requiereRevision: datos.requiereRevision ?? false,
      })
      .returning({ id: citas.id });
    // Con pago online, la confirmación se envía recién cuando el pago se aprueba.
    if (!datos.pagoOnline) await programarAvisosCita(db, cita.id, "confirmacion");
    return { citaId: cita.id };
  } catch (error) {
    if (esConflictoHorario(error)) return { error: "Alguien acaba de tomar esa hora. Por favor elige otra." };
    throw error;
  }
}

export async function anularCita(
  db: Db,
  citaId: string,
  motivo: string | null,
): Promise<{ ok: true } | ErrorCita> {
  const [cita] = await db.select().from(citas).where(eq(citas.id, citaId));
  if (!cita) return { error: "La cita no existe." };
  if (!(ESTADOS_GESTIONABLES as readonly string[]).includes(cita.estado)) {
    return { error: "Esta cita ya no se puede anular." };
  }
  await db
    .update(citas)
    .set({ estado: "cancelada", canceladaEn: new Date(), motivoCancelacion: motivo })
    .where(and(eq(citas.id, citaId), inArray(citas.estado, [...ESTADOS_GESTIONABLES])));
  // Una reserva que nunca se pagó no recibe aviso de anulación.
  if (cita.estado !== "pendiente_pago") await programarAvisosCita(db, cita.id, "cancelacion");
  if (!cita.sobrecupo) await ofrecerHoraLiberada(db, cita);
  return { ok: true };
}

export async function reagendarCita(
  db: Db,
  citaId: string,
  nuevoInicio: Date,
): Promise<{ ok: true } | ErrorCita> {
  const [cita] = await db.select().from(citas).where(eq(citas.id, citaId));
  if (!cita) return { error: "La cita no existe." };
  if (cita.estado === "pendiente_pago") return { error: "Primero completa el pago de esta hora." };
  if (!(ESTADOS_GESTIONABLES as readonly string[]).includes(cita.estado) || cita.inicio <= new Date()) {
    return { error: "Esta cita ya no se puede reagendar." };
  }

  const fecha = fechaLocal(nuevoInicio);
  const { cupos } = await buscarCupos(db, {
    especialidadId: cita.especialidadId,
    medicoId: cita.medicoId,
    desde: fecha,
    hasta: fecha,
    excluirCitaId: cita.id,
  });
  const cupo = cupos.find((c) => c.inicio.getTime() === nuevoInicio.getTime());
  if (!cupo) return { error: "Esa hora ya no está disponible. Por favor elige otra." };

  try {
    await db
      .update(citas)
      .set({ inicio: cupo.inicio, fin: cupo.fin, estado: "agendada", sobrecupo: false })
      .where(eq(citas.id, citaId));
  } catch (error) {
    if (esConflictoHorario(error)) return { error: "Alguien acaba de tomar esa hora. Por favor elige otra." };
    throw error;
  }
  await programarAvisosCita(db, cita.id, "reagendamiento");
  await ofrecerHoraLiberada(db, cita);
  return { ok: true };
}

/**
 * Cuando se libera una hora futura, se ofrece a la primera persona de la lista
 * de espera que calce (misma especialidad, médico indicado o cualquiera, y
 * fecha dentro de su rango). El aviso lo envía el proceso de notificaciones.
 */
export async function ofrecerHoraLiberada(
  db: Db,
  cita: { id: string; especialidadId: string; medicoId: string; inicio: Date },
): Promise<void> {
  if (cita.inicio <= new Date()) return;
  const fecha = fechaLocal(cita.inicio);
  const [candidato] = await db
    .select()
    .from(listaEspera)
    .where(
      and(
        eq(listaEspera.estado, "activa"),
        eq(listaEspera.especialidadId, cita.especialidadId),
        or(isNull(listaEspera.medicoId), eq(listaEspera.medicoId, cita.medicoId)),
        lte(listaEspera.desde, fecha),
        gte(listaEspera.hasta, fecha),
      ),
    )
    .orderBy(asc(listaEspera.creadoEn))
    .limit(1);
  if (!candidato) return;

  // Una misma hora liberada se ofrece una sola vez (índice único por cita, canal y tipo).
  const avisos = await db
    .insert(notificaciones)
    .values(
      (["email", "whatsapp"] as const).map((canal) => ({
        citaId: cita.id,
        pacienteId: candidato.pacienteId,
        canal,
        tipo: "lista_espera" as const,
        programadaPara: new Date(),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notificaciones.id });
  if (avisos.length === 0) return;
  await db
    .update(listaEspera)
    .set({ estado: "notificada", notificadaEn: new Date() })
    .where(and(eq(listaEspera.id, candidato.id), eq(listaEspera.estado, "activa")));
}
