import type { Db } from "~/db/client";
import { auditoria } from "~/db/schema";

/** Deja constancia de quién hizo qué. Nunca debe tumbar la operación principal. */
export async function registrarAuditoria(
  db: Db,
  request: Request,
  datos: {
    usuarioId: string;
    accion: string;
    entidad: string;
    entidadId?: string;
    detalle?: Record<string, unknown>;
  },
) {
  try {
    await db.insert(auditoria).values({
      userId: datos.usuarioId,
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId,
      detalle: datos.detalle,
      ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
    });
  } catch (error) {
    console.error("No se pudo registrar la auditoría", error);
  }
}
