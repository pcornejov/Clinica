import { and, eq, inArray } from "drizzle-orm";
import { clinica } from "~/config/clinica";
import type { Db } from "~/db/client";
import { citas, notificaciones } from "~/db/schema";

const CANALES = ["email", "whatsapp"] as const;
type Tipo = (typeof notificaciones.tipo.enumValues)[number];

/** Programa (o reprograma) un aviso. `reemplazar` vuelve a dejarlo pendiente si ya existía. */
async function programar(db: Db, cita: { id: string; pacienteId: string }, tipo: Tipo, cuando: Date, reemplazar: boolean) {
  for (const canal of CANALES) {
    const fila = { citaId: cita.id, pacienteId: cita.pacienteId, canal, tipo, programadaPara: cuando };
    const insercion = db.insert(notificaciones).values(fila);
    if (reemplazar) {
      await insercion.onConflictDoUpdate({
        target: [notificaciones.citaId, notificaciones.canal, notificaciones.tipo],
        set: { estado: "pendiente", programadaPara: cuando, intentos: 0, error: null, enviadaEn: null, bloqueadaEn: null },
      });
    } else {
      await insercion.onConflictDoNothing();
    }
  }
}

async function quitarPendientes(db: Db, citaId: string, tipos: Tipo[]) {
  await db
    .delete(notificaciones)
    .where(and(eq(notificaciones.citaId, citaId), inArray(notificaciones.tipo, tipos), eq(notificaciones.estado, "pendiente")));
}

async function programarRecordatorio(db: Db, cita: { id: string; pacienteId: string; inicio: Date }) {
  const cuando = new Date(cita.inicio.getTime() - clinica.reglas.recordatorioHorasAntes * 3_600_000);
  // Si la cita es muy pronto, la confirmación hace de recordatorio.
  if (cuando.getTime() > Date.now() + 60 * 60_000) {
    await programar(db, cita, "recordatorio_24h", cuando, true);
  } else {
    await quitarPendientes(db, cita.id, ["recordatorio_24h"]);
  }
}

/**
 * Programa los avisos de un evento de la cita. El envío lo hace la cola
 * (inmediatamente en segundo plano y, como respaldo, el cron cada 5 minutos).
 */
export async function programarAvisosCita(
  db: Db,
  citaId: string,
  evento: "confirmacion" | "reagendamiento" | "cancelacion" | "recordatorio_ahora",
): Promise<void> {
  const [cita] = await db.select().from(citas).where(eq(citas.id, citaId));
  if (!cita) return;
  const ahora = new Date();

  switch (evento) {
    case "confirmacion":
      await programar(db, cita, "confirmacion", ahora, false);
      await programarRecordatorio(db, cita);
      break;
    case "reagendamiento":
      await programar(db, cita, "reagendamiento", ahora, true);
      await programarRecordatorio(db, cita);
      break;
    case "recordatorio_ahora":
      // Recepción pide reenviar el recordatorio (con botones de confirmar/anular).
      await programar(db, cita, "recordatorio_24h", ahora, true);
      break;
    case "cancelacion":
      await quitarPendientes(db, cita.id, ["confirmacion", "recordatorio_24h", "recordatorio_2h", "reagendamiento"]);
      await programar(db, cita, "cancelacion", ahora, false);
      break;
  }
}
