import { eq } from "drizzle-orm";
import { pacientes } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { normalizarRut } from "~/lib/rut";
import { requerirRol } from "~/lib/sesion.server";
import type { Route } from "./+types/pacientes-buscar";

// Búsqueda de pacientes por RUT para recepción (solo personal autenticado).
export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin", "recepcion")];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const rut = normalizarRut(new URL(request.url).searchParams.get("rut") ?? "");
  if (!rut) return { encontrado: false };
  const [p] = await db.select().from(pacientes).where(eq(pacientes.rut, rut));
  if (!p) return { encontrado: false };
  return { encontrado: true, nombre: `${p.nombres} ${p.apellidos}`, prevision: p.prevision };
}
