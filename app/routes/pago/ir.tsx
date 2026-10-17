import { useEffect, useRef } from "react";
import { contextoApp } from "~/lib/contexto";
import { pagoPorToken } from "~/modules/pagos.server";
import { configWebpay } from "~/modules/webpay.server";
import type { Route } from "./+types/ir";

export function meta() {
  return [{ title: "Redirigiendo a Webpay…" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db, env } = context.get(contextoApp);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const pago = await pagoPorToken(db, token);
  if (!pago || pago.estado !== "pendiente") throw new Response("Pago no encontrado", { status: 404 });
  const { modo } = configWebpay(env);
  // Webpay recibe el token por POST; el simulador propio, por GET.
  return modo === "simulado"
    ? { url: "/pago/simulador", metodo: "get" as const, token }
    : { url: String(pago.detalle?.url), metodo: "post" as const, token };
}

export default function IrAWebpay({ loaderData }: Route.ComponentProps) {
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => formulario.current?.submit(), []);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form ref={formulario} method={loaderData.metodo} action={loaderData.url} className="text-center">
        <input type="hidden" name="token_ws" value={loaderData.token} />
        <p className="text-lg text-slate-700">Te estamos llevando a Webpay para pagar…</p>
        <button className="mt-6 rounded-lg bg-marca-600 px-5 py-2.5 font-medium text-white">Continuar al pago</button>
      </form>
    </main>
  );
}
