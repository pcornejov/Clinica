import { redirect } from "react-router";
import { contextoApp } from "~/lib/contexto";
import { enSegundoPlano } from "~/lib/contexto";
import { crearTokenGestion } from "~/lib/token-gestion.server";
import { procesarCola } from "~/modules/avisos/cola.server";
import { procesarRetornoWebpay } from "~/modules/pagos.server";
import type { Route } from "./+types/retorno";

/**
 * Transbank devuelve al paciente aquí (por GET o POST, según el caso) con
 * token_ws, o con TBK_TOKEN / TBK_ORDEN_COMPRA si anuló o se le acabó el tiempo.
 */
async function procesar(request: Request, context: Route.LoaderArgs["context"]) {
  const app = context.get(contextoApp);
  const url = new URL(request.url);
  const campos = new URLSearchParams(url.search);
  if (request.method === "POST") {
    for (const [k, v] of await request.formData()) campos.set(k, String(v));
  }
  const resultado = await procesarRetornoWebpay(app, {
    tokenWs: campos.get("token_ws"),
    tbkToken: campos.get("TBK_TOKEN"),
    ordenCompra: campos.get("TBK_ORDEN_COMPRA"),
  });
  if (resultado.resultado === "error") throw new Response("No encontramos este pago", { status: 404 });
  if (resultado.resultado === "pagado") enSegundoPlano(app, procesarCola(app.db, app.env));
  const token = await crearTokenGestion(resultado.citaId, app.env.BETTER_AUTH_SECRET);
  return redirect(`/cita/${token}?pago=${resultado.resultado}`);
}

export const loader = ({ request, context }: Route.LoaderArgs) => procesar(request, context);
export const action = ({ request, context }: Route.ActionArgs) => procesar(request, context);
