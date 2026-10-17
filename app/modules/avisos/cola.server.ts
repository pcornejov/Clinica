import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { clinica } from "~/config/clinica";
import type { Db } from "~/db/client";
import { citas, especialidades, medicos, notificaciones, pacientes } from "~/db/schema";
import { fechaLocal, formatearFechaHora } from "~/lib/fechas";
import { crearTokenGestion } from "~/lib/token-gestion.server";
import { enviarEmail, enviarPlantillaWhatsapp } from "./envio.server";
import { construirAviso, textoWhatsapp, type TipoAviso } from "./plantillas";

const MAX_INTENTOS = 3;
type Notificacion = typeof notificaciones.$inferSelect;
type Paciente = typeof pacientes.$inferSelect;

/** Persona a la que se le escribe: el paciente, o su tutor si es un dependiente sin contacto propio. */
async function contactoDe(db: Db, paciente: Paciente): Promise<Paciente> {
  if (paciente.tutorId && !paciente.email && !paciente.telefono) {
    const [tutor] = await db.select().from(pacientes).where(eq(pacientes.id, paciente.tutorId));
    if (tutor) return tutor;
  }
  return paciente;
}

type Preparado =
  | { omitir: string }
  | { contacto: Paciente; aviso: ReturnType<typeof construirAviso> };

async function preparar(db: Db, env: Env, n: Notificacion): Promise<Preparado> {
  const [paciente] = await db.select().from(pacientes).where(eq(pacientes.id, n.pacienteId));
  if (!paciente) return { omitir: "El paciente no existe" };
  if (!n.citaId) return { omitir: "Aviso sin cita" };

  const [fila] = await db
    .select({ cita: citas, especialidad: especialidades.nombre, medico: { nombres: medicos.nombres, apellidos: medicos.apellidos } })
    .from(citas)
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .innerJoin(medicos, eq(medicos.id, citas.medicoId))
    .where(eq(citas.id, n.citaId));
  if (!fila) return { omitir: "La cita no existe" };
  const { cita } = fila;

  const tipo = n.tipo as TipoAviso;
  const vigente = cita.estado === "agendada" || cita.estado === "confirmada";
  if ((tipo === "confirmacion" || tipo === "reagendamiento" || tipo.startsWith("recordatorio")) && !vigente) {
    return { omitir: "La cita ya no está vigente" };
  }
  if (tipo.startsWith("recordatorio") && cita.inicio <= new Date()) return { omitir: "La cita ya pasó" };

  const contacto = await contactoDe(db, paciente);
  const token = await crearTokenGestion(cita.id, env.BETTER_AUTH_SECRET);
  const base = env.APP_URL.replace(/\/$/, "");
  const linkAgendar =
    tipo === "lista_espera"
      ? `${base}/agendar?${new URLSearchParams({ modo: "profesional", medico: cita.medicoId, especialidad: cita.especialidadId, desde: fechaLocal(cita.inicio) })}`
      : `${base}/agendar?${new URLSearchParams({ especialidad: cita.especialidadId })}`;

  const aviso = construirAviso(tipo, {
    clinica: { nombre: clinica.nombre, direccion: clinica.direccion, telefono: clinica.telefono },
    nombre: contacto.nombres.split(" ")[0],
    paraQuien: contacto.id !== paciente.id ? paciente.nombres.split(" ")[0] : null,
    especialidad: fila.especialidad,
    medico: `${fila.medico.nombres} ${fila.medico.apellidos}`,
    fechaHora: formatearFechaHora(cita.inicio),
    linkGestion: `${base}/cita/${token}`,
    linkAgendar,
    tokenGestion: token,
  });
  return { contacto, aviso };
}

async function enviarUna(db: Db, env: Env, n: Notificacion): Promise<"enviada" | "omitida"> {
  const p = await preparar(db, env, n);
  const omitir = async (motivo: string) => {
    await db.update(notificaciones).set({ estado: "omitida", error: motivo, bloqueadaEn: null }).where(eq(notificaciones.id, n.id));
    return "omitida" as const;
  };
  if ("omitir" in p) return omitir(p.omitir);

  if (n.canal === "email") {
    if (!p.contacto.email) return omitir("Sin correo registrado");
    const r = await enviarEmail(env, { para: p.contacto.email, ...p.aviso.email });
    await db
      .update(notificaciones)
      .set({ estado: "enviada", enviadaEn: new Date(), destino: p.contacto.email, asunto: p.aviso.email.asunto, cuerpo: p.aviso.email.texto, idExterno: r.id, error: null, bloqueadaEn: null })
      .where(eq(notificaciones.id, n.id));
    return "enviada";
  }

  // La plantilla de lista de espera no está aprobada en Meta (la toma como Marketing).
  if (n.tipo === "lista_espera") return omitir("La lista de espera avisa solo por correo");
  // WhatsApp exige consentimiento explícito (Ley 21.719).
  if (!p.contacto.telefono) return omitir("Sin celular registrado");
  if (!p.contacto.consentimientoContactoEn) return omitir("Sin consentimiento para WhatsApp");
  const r = await enviarPlantillaWhatsapp(env, p.contacto.telefono, p.aviso.whatsapp);
  await db
    .update(notificaciones)
    .set({ estado: "enviada", enviadaEn: new Date(), destino: p.contacto.telefono, asunto: p.aviso.whatsapp.plantilla, cuerpo: textoWhatsapp(p.aviso.whatsapp), idExterno: r.id, error: null, bloqueadaEn: null })
    .where(eq(notificaciones.id, n.id));
  return "enviada";
}

/**
 * Envía los avisos pendientes cuya hora llegó. Cada aviso se "toma" con
 * FOR UPDATE SKIP LOCKED, así dos procesos simultáneos (el cron y el envío
 * inmediato tras una reserva) nunca envían el mismo aviso dos veces.
 */
export async function procesarCola(db: Db, env: Env, limite = 25) {
  const ahora = new Date();

  // Avisos tomados por un proceso que murió a medias: se liberan tras 10 minutos.
  await db
    .update(notificaciones)
    .set({ estado: "pendiente", bloqueadaEn: null })
    .where(and(eq(notificaciones.estado, "procesando"), lt(notificaciones.bloqueadaEn, new Date(ahora.getTime() - 10 * 60_000))));

  const tomadas = await db
    .update(notificaciones)
    .set({ estado: "procesando", bloqueadaEn: ahora, intentos: sql`${notificaciones.intentos} + 1` })
    .where(
      inArray(
        notificaciones.id,
        db
          .select({ id: notificaciones.id })
          .from(notificaciones)
          .where(and(eq(notificaciones.estado, "pendiente"), lte(notificaciones.programadaPara, ahora)))
          .orderBy(asc(notificaciones.programadaPara))
          .limit(limite)
          .for("update", { skipLocked: true }),
      ),
    )
    .returning();

  const resumen = { enviadas: 0, omitidas: 0, fallidas: 0, reintentos: 0 };
  for (const n of tomadas) {
    try {
      const r = await enviarUna(db, env, n);
      resumen[r === "enviada" ? "enviadas" : "omitidas"]++;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      const reintentar = n.intentos < MAX_INTENTOS;
      await db
        .update(notificaciones)
        .set({
          estado: reintentar ? "pendiente" : "fallida",
          programadaPara: reintentar ? new Date(Date.now() + n.intentos * 10 * 60_000) : n.programadaPara,
          error: mensaje.slice(0, 500),
          bloqueadaEn: null,
        })
        .where(eq(notificaciones.id, n.id));
      resumen[reintentar ? "reintentos" : "fallidas"]++;
      console.error(`Aviso ${n.id} (${n.canal}/${n.tipo}) falló:`, mensaje);
    }
  }
  return resumen;
}
