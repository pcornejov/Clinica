import { eq } from "drizzle-orm";
import { z } from "zod";
import { adjuntos } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { requerirRol } from "~/lib/sesion.server";
import { bucketArchivos } from "~/modules/archivos.server";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { medicoDeUsuario, tipoAcceso } from "~/modules/fichas.server";
import type { Route } from "./+types/adjunto";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("medico")];

/** Descarga de un archivo de la ficha: exige acceso a la ficha y queda en la auditoría. */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, env } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);
  const id = z.uuid().safeParse(params.id).data;
  const [archivo] = id ? await db.select().from(adjuntos).where(eq(adjuntos.id, id)) : [];
  if (!archivo) throw new Response("Archivo no encontrado", { status: 404 });

  const medico = await medicoDeUsuario(db, usuario.id);
  if (!(await tipoAcceso(db, medico, usuario.id, archivo.pacienteId))) throw new Response("Sin acceso a esta ficha", { status: 403 });

  const objeto = await bucketArchivos(env)?.get(archivo.claveR2);
  if (!objeto) throw new Response("Archivo no encontrado", { status: 404 });
  await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: "descargar_adjunto", entidad: "ficha", entidadId: archivo.pacienteId, detalle: { adjuntoId: archivo.id } });

  return new Response(objeto.body, {
    headers: {
      "Content-Type": archivo.tipoMime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(archivo.nombreArchivo)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
