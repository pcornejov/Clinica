import { and, eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { citas, pacientes } from "~/db/schema";
import { formatearFechaHora } from "~/lib/fechas";
import { normalizarTelefono } from "~/lib/telefono";
import { verificarTokenGestion } from "~/lib/token-gestion.server";
import { anularConDevolucion } from "../pagos.server";

/**
 * Procesa la respuesta de un paciente a los botones del recordatorio
 * ("CONFIRMAR:<token>" o "ANULAR:<token>"). Se exige que el token tenga firma
 * válida Y que responda el mismo teléfono registrado del paciente o su tutor.
 * Devuelve el texto con que se le contesta.
 */
export async function procesarRespuestaWhatsapp(
  s: { db: Db; env: Env },
  respuesta: { telefono: string; payload: string },
): Promise<string> {
  const [accion, token] = respuesta.payload.split(/:(.+)/);
  const citaId = token ? await verificarTokenGestion(token, s.env.BETTER_AUTH_SECRET) : null;
  if (!citaId || (accion !== "CONFIRMAR" && accion !== "ANULAR")) {
    return "No pudimos procesar tu respuesta. Si necesitas ayuda, llámanos.";
  }

  const [fila] = await s.db
    .select({ cita: citas, paciente: pacientes })
    .from(citas)
    .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
    .where(eq(citas.id, citaId));
  if (!fila) return "No encontramos esa hora.";

  const telefonos = [fila.paciente.telefono];
  if (fila.paciente.tutorId) {
    const [tutor] = await s.db.select({ telefono: pacientes.telefono }).from(pacientes).where(eq(pacientes.id, fila.paciente.tutorId));
    telefonos.push(tutor?.telefono ?? null);
  }
  const quienResponde = normalizarTelefono(respuesta.telefono) ?? `+${respuesta.telefono.replace(/\D/g, "")}`;
  if (!telefonos.includes(quienResponde)) return "Esta hora no está asociada a tu número. Si necesitas ayuda, llámanos.";

  const { cita } = fila;
  const cuando = formatearFechaHora(cita.inicio);
  if (cita.inicio <= new Date() || !["agendada", "confirmada"].includes(cita.estado)) {
    return `Tu hora del ${cuando} ya no se puede modificar.`;
  }

  if (accion === "CONFIRMAR") {
    await s.db.update(citas).set({ estado: "confirmada" }).where(and(eq(citas.id, cita.id), eq(citas.estado, "agendada")));
    return `¡Gracias! Tu asistencia para el ${cuando} quedó confirmada. Te esperamos.`;
  }

  const r = await anularConDevolucion(s, cita.id, "Anulada por el paciente vía WhatsApp");
  if ("error" in r) return r.error;
  const devolucion =
    r.devolucion === "realizada"
      ? " Te devolveremos el pago a tu tarjeta."
      : r.devolucion === "no_corresponde"
        ? " Por anular con poca anticipación, el pago no se devuelve."
        : "";
  return `Tu hora del ${cuando} fue anulada.${devolucion} Gracias por avisarnos: así otra persona puede usarla.`;
}
