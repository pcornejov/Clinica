import { contextoApp } from "~/lib/contexto";
import { requerirRol } from "~/lib/sesion.server";
import { buscarCie10 } from "~/modules/fichas.server";
import type { Route } from "./+types/cie10";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("medico")];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  return { resultados: await buscarCie10(db, new URL(request.url).searchParams.get("q") ?? "") };
}
