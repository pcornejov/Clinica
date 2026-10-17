import { eq } from "drizzle-orm";
import { Form, redirect } from "react-router";
import { clinica } from "~/config/clinica";
import { citas, especialidades } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { formatearPesos } from "~/lib/fechas";
import { pagoPorToken, registrarSimulacion } from "~/modules/pagos.server";
import { configWebpay } from "~/modules/webpay.server";
import type { Route } from "./+types/simulador";

/**
 * Simulador del formulario de pago, para demos sin acceso a Transbank.
 * Solo existe con TRANSBANK_MODO="simulado" y vuelve a la clínica exactamente
 * como lo hace Webpay (token_ws, o TBK_TOKEN si se anula).
 */
export function meta() {
  return [{ title: "Pago de prueba (simulador)" }, { name: "robots", content: "noindex" }];
}

async function cargar(context: Route.LoaderArgs["context"], token: string) {
  const { db, env } = context.get(contextoApp);
  if (configWebpay(env).modo !== "simulado") throw new Response("No encontrado", { status: 404 });
  const pago = await pagoPorToken(db, token);
  if (!pago || pago.estado !== "pendiente") throw new Response("Transacción no válida", { status: 404 });
  return { db, pago };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token_ws") ?? "";
  const { db, pago } = await cargar(context, token);
  const [fila] = await db
    .select({ especialidad: especialidades.nombre })
    .from(citas)
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .where(eq(citas.id, pago.citaId));
  return { token, monto: pago.monto, orden: String(pago.detalle?.ordenCompra ?? ""), detalle: fila?.especialidad ?? "Consulta" };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formulario = await request.formData();
  const token = String(formulario.get("token_ws") ?? "");
  const decision = String(formulario.get("decision"));
  const { db, pago } = await cargar(context, token);
  if (decision === "anular") {
    const p = new URLSearchParams({ TBK_TOKEN: token, TBK_ORDEN_COMPRA: String(pago.detalle?.ordenCompra ?? ""), TBK_ID_SESION: pago.citaId });
    return redirect(`/pago/webpay/retorno?${p}`);
  }
  await registrarSimulacion(db, token, decision === "aprobar" ? "aprobado" : "rechazado");
  return redirect(`/pago/webpay/retorno?${new URLSearchParams({ token_ws: token })}`);
}

export default function Simulador({ loaderData }: Route.ComponentProps) {
  const d = loaderData;
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md">
        <p className="rounded-lg bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Simulador de pago para demostraciones · no se cobra dinero real
        </p>
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Pagando a</p>
          <p className="font-semibold text-slate-900">{clinica.nombre}</p>
          <div className="mt-4 flex items-end justify-between border-y border-slate-100 py-4">
            <div>
              <p className="text-sm text-slate-500">{d.detalle}</p>
              <p className="text-xs text-slate-400">Orden {d.orden}</p>
            </div>
            <p className="text-2xl font-semibold text-slate-900">{formatearPesos(d.monto)}</p>
          </div>
          <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <p>Tarjeta de prueba VISA ···· 6623 (aprobada)</p>
            <p>Tarjeta de prueba Mastercard ···· 0568 (rechazada)</p>
          </div>
          <Form method="post" className="mt-6 space-y-3">
            <input type="hidden" name="token_ws" value={d.token} />
            <button name="decision" value="aprobar" className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white hover:bg-emerald-700">
              Pagar con VISA ···· 6623
            </button>
            <button name="decision" value="rechazar" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50">
              Pagar con Mastercard ···· 0568 (será rechazada)
            </button>
            <button name="decision" value="anular" className="w-full px-4 py-2 text-sm text-slate-500 underline">
              Anular compra y volver al comercio
            </button>
          </Form>
        </div>
      </div>
    </main>
  );
}
