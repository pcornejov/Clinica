import { desc, eq } from "drizzle-orm";
import { data, Form } from "react-router";
import { z } from "zod";
import { Aviso, Boton } from "~/components/formulario";
import { notificaciones, pacientes } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { formatearFechaHora } from "~/lib/fechas";
import { crearTokenGestion } from "~/lib/token-gestion.server";
import { procesarCola } from "~/modules/avisos/cola.server";
import { emailSimulado, whatsappSimulado } from "~/modules/avisos/envio.server";
import { procesarRespuestaWhatsapp } from "~/modules/avisos/respuestas.server";
import { configWebpay } from "~/modules/webpay.server";
import type { Route } from "./+types/avisos";

export function meta() {
  return [{ title: "Avisos · Recepción" }];
}

const TEXTO_TIPO: Record<string, string> = {
  confirmacion: "Confirmación",
  recordatorio_24h: "Recordatorio",
  recordatorio_2h: "Recordatorio",
  reagendamiento: "Cambio de hora",
  cancelacion: "Anulación",
  lista_espera: "Hora liberada",
};
const ESTILO_ESTADO: Record<string, string> = {
  pendiente: "bg-sky-100 text-sky-800",
  procesando: "bg-sky-100 text-sky-800",
  enviada: "bg-emerald-100 text-emerald-800",
  fallida: "bg-rose-100 text-rose-800",
  omitida: "bg-slate-100 text-slate-500",
};

export async function loader({ context }: Route.LoaderArgs) {
  const { db, env } = context.get(contextoApp);
  const lista = await db
    .select({ n: notificaciones, paciente: { nombres: pacientes.nombres, apellidos: pacientes.apellidos } })
    .from(notificaciones)
    .innerJoin(pacientes, eq(pacientes.id, notificaciones.pacienteId))
    .orderBy(desc(notificaciones.creadoEn), desc(notificaciones.programadaPara))
    .limit(100);
  return {
    modos: { email: emailSimulado(env), whatsapp: whatsappSimulado(env), webpay: configWebpay(env).modo },
    lista: lista.map(({ n, paciente }) => ({
      id: n.id,
      canal: n.canal,
      tipo: TEXTO_TIPO[n.tipo] ?? n.tipo,
      esRecordatorioWhatsapp: n.canal === "whatsapp" && n.tipo.startsWith("recordatorio") && n.estado === "enviada",
      estado: n.estado,
      programadaPara: formatearFechaHora(n.programadaPara),
      enviadaEn: n.enviadaEn ? formatearFechaHora(n.enviadaEn) : null,
      destino: n.destino,
      asunto: n.asunto,
      cuerpo: n.cuerpo,
      error: n.error,
      simulado: n.idExterno === "simulado",
      paciente: `${paciente.nombres} ${paciente.apellidos}`,
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const app = context.get(contextoApp);
  const formulario = await request.formData();

  if (formulario.get("intent") === "procesar") {
    const r = await procesarCola(app.db, app.env);
    return data({ mensaje: `Enviados: ${r.enviadas} · omitidos: ${r.omitidas} · con error: ${r.fallidas + r.reintentos}`, error: null });
  }

  // Demo sin WhatsApp real: simula que el paciente tocó un botón del recordatorio.
  if (formulario.get("intent") === "simular") {
    if (!whatsappSimulado(app.env)) return data({ mensaje: null, error: "Solo disponible en modo simulado" }, { status: 400 });
    const id = z.uuid().safeParse(formulario.get("id")).data;
    const accion = z.enum(["CONFIRMAR", "ANULAR"]).safeParse(formulario.get("accion")).data;
    const [n] = id ? await app.db.select().from(notificaciones).where(eq(notificaciones.id, id)) : [];
    if (!n?.citaId || !n.destino || !accion) return data({ mensaje: null, error: "Aviso no válido" }, { status: 400 });
    const token = await crearTokenGestion(n.citaId, app.env.BETTER_AUTH_SECRET);
    const respuesta = await procesarRespuestaWhatsapp(app, { telefono: n.destino, payload: `${accion}:${token}` });
    await procesarCola(app.db, app.env);
    return data({ mensaje: `Respuesta automática al paciente: "${respuesta}"`, error: null });
  }
  return data({ mensaje: null, error: "Acción no válida" }, { status: 400 });
}

export default function Avisos({ loaderData, actionData }: Route.ComponentProps) {
  const { modos, lista } = loaderData;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Avisos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Correo: {modos.email ? "simulado (falta RESEND_API_KEY)" : "Resend"} · WhatsApp: {modos.whatsapp ? "simulado (falta configurar Meta)" : "Meta Cloud API"} · Webpay: {modos.webpay}
          </p>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="procesar" />
          <Boton variante="secundario">Enviar pendientes ahora</Boton>
        </Form>
      </div>
      {actionData?.mensaje && <div className="mt-4"><Aviso tipo="ok">{actionData.mensaje}</Aviso></div>}
      {actionData?.error && <div className="mt-4"><Aviso tipo="error">{actionData.error}</Aviso></div>}

      <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {lista.length === 0 && <li className="px-5 py-10 text-center text-slate-400">Aún no hay avisos.</li>}
        {lista.map((a) => (
          <li key={a.id} className="px-5 py-3 text-sm">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                <span className={`w-20 rounded px-2 py-0.5 text-center text-xs ${a.canal === "email" ? "bg-indigo-50 text-indigo-700" : "bg-green-50 text-green-700"}`}>
                  {a.canal === "email" ? "Correo" : "WhatsApp"}
                </span>
                <span className="w-32 font-medium text-slate-900">{a.tipo}</span>
                <span className="min-w-40 flex-1 text-slate-600">{a.paciente}{a.destino && <span className="text-slate-400"> · {a.destino}</span>}</span>
                <span className="text-xs text-slate-400">{a.enviadaEn ?? `Programado: ${a.programadaPara}`}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${ESTILO_ESTADO[a.estado]}`}>
                  {a.estado}{a.simulado && " (simulado)"}
                </span>
              </summary>
              <div className="mt-3 rounded-lg bg-slate-50 p-4">
                {a.error && <p className="mb-2 text-rose-700">{a.error}</p>}
                {a.asunto && <p className="font-medium text-slate-900">{a.canal === "email" ? `Asunto: ${a.asunto}` : `Plantilla: ${a.asunto}`}</p>}
                {a.cuerpo ? <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{a.cuerpo}</pre> : !a.error && <p className="text-slate-400">Aún no se envía.</p>}
                {a.esRecordatorioWhatsapp && modos.whatsapp && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Simular respuesta del paciente:</span>
                    {(["CONFIRMAR", "ANULAR"] as const).map((accion) => (
                      <Form method="post" key={accion}>
                        <input type="hidden" name="intent" value="simular" />
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="accion" value={accion} />
                        <button className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50">
                          {accion === "CONFIRMAR" ? "Confirmar asistencia" : "Anular hora"}
                        </button>
                      </Form>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
