import { eq } from "drizzle-orm";
import { data, Form, Link, redirect, useSearchParams } from "react-router";
import { estiloEstadoCita, textoEstadoCita } from "~/components/panel";
import { Aviso } from "~/components/formulario";
import { clinica } from "~/config/clinica";
import { citas, especialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp, enSegundoPlano } from "~/lib/contexto";
import { formatearFechaHora, formatearPesos } from "~/lib/fechas";
import { verificarTokenGestion } from "~/lib/token-gestion.server";
import { procesarCola } from "~/modules/avisos/cola.server";
import { ESTADOS_GESTIONABLES } from "~/modules/citas.server";
import { anulacionConDevolucion, anularConDevolucion, iniciarPagoWebpay, pagosDeCitas, TEXTO_MEDIO } from "~/modules/pagos.server";
import type { Route } from "./+types/cita";

export function meta() {
  return [{ title: `Tu hora · ${clinica.nombre}` }, { name: "robots", content: "noindex" }];
}

async function citaDesdeToken(context: Route.LoaderArgs["context"], token: string) {
  const { db, env } = context.get(contextoApp);
  const citaId = await verificarTokenGestion(token, env.BETTER_AUTH_SECRET);
  if (!citaId) throw new Response("Enlace no válido", { status: 404 });
  const [fila] = await db
    .select({
      cita: citas,
      medico: { nombres: medicos.nombres, apellidos: medicos.apellidos },
      especialidad: especialidades.nombre,
      paciente: pacientes.nombres,
    })
    .from(citas)
    .innerJoin(medicos, eq(medicos.id, citas.medicoId))
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
    .where(eq(citas.id, citaId));
  if (!fila) throw new Response("Enlace no válido", { status: 404 });
  return fila;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const { cita, medico, especialidad, paciente } = await citaDesdeToken(context, params.token);
  const pago = (await pagosDeCitas(db, [cita.id])).get(cita.id);
  const ahora = new Date();
  const futura = cita.inicio > ahora;
  const pagadaOnline = pago?.medio === "webpay" && pago.estado === "pagado";
  return {
    // Solo el primer nombre: el enlace podría reenviarse a otra persona.
    paciente,
    estado: cita.estado,
    inicio: cita.inicio.toISOString(),
    especialidad,
    medico: `${medico.nombres} ${medico.apellidos}`,
    precio: cita.precio,
    pago: pago
      ? { estado: pago.estado, medio: TEXTO_MEDIO[pago.medio], tarjeta: (pago.detalle?.tarjeta as string | undefined) ?? null }
      : null,
    gestionable: (ESTADOS_GESTIONABLES as readonly string[]).includes(cita.estado) && futura,
    reagendable: (cita.estado === "agendada" || cita.estado === "confirmada") && futura,
    puedePagar: cita.estado === "pendiente_pago" && (!cita.reservaExpiraEn || cita.reservaExpiraEn > ahora),
    reservaExpiraEn: cita.reservaExpiraEn?.toISOString() ?? null,
    // Aviso antes de anular: si pagó online con poca anticipación, no hay devolución.
    sinDevolucion: pagadaOnline && !anulacionConDevolucion(cita.inicio),
    horasDevolucion: clinica.reglas.cancelacionConDevolucionHoras,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const app = context.get(contextoApp);
  const { cita } = await citaDesdeToken(context, params.token);
  const formulario = await request.formData();

  if (formulario.get("intent") === "pagar") {
    const r = await iniciarPagoWebpay(app, cita.id, new URL(request.url).origin);
    if ("error" in r) return data({ error: r.error }, { status: 409 });
    return redirect(`/pago/webpay/ir?${new URLSearchParams({ token: r.token })}`);
  }

  if (formulario.get("intent") === "anular") {
    const motivo = String(formulario.get("motivo") ?? "").trim().slice(0, 300) || null;
    const r = await anularConDevolucion(app, cita.id, motivo);
    if ("error" in r) return data({ error: r.error }, { status: 409 });
    enSegundoPlano(app, procesarCola(app.db, app.env));
    return redirect(`/cita/${params.token}?anulada=1${r.devolucion === "realizada" ? "&devolucion=1" : ""}`);
  }
  return data({ error: "Acción no válida" }, { status: 400 });
}

export default function Cita({ loaderData, actionData, params }: Route.ComponentProps) {
  const c = loaderData;
  const [busqueda] = useSearchParams();
  const textoPago = !c.pago
    ? `${formatearPesos(c.precio)} · pago en la clínica`
    : c.pago.estado === "pagado"
      ? `${formatearPesos(c.precio)} · pagado con ${c.pago.medio}${c.pago.tarjeta ? ` ···· ${c.pago.tarjeta}` : ""}`
      : c.pago.estado === "reembolsado"
        ? `${formatearPesos(c.precio)} · pago devuelto`
        : `${formatearPesos(c.precio)} · pago pendiente`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <MensajeEstado />
      <h1 className="text-3xl font-semibold text-slate-900">Hola, {c.paciente.split(" ")[0]}</h1>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Tu hora</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatearFechaHora(new Date(c.inicio))}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm ${estiloEstadoCita[c.estado]}`}>{textoEstadoCita[c.estado]}</span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Especialidad</dt><dd className="font-medium text-slate-900">{c.especialidad}</dd></div>
          <div><dt className="text-slate-500">Profesional</dt><dd className="font-medium text-slate-900">{c.medico}</dd></div>
          <div><dt className="text-slate-500">Dirección</dt><dd className="font-medium text-slate-900">{clinica.direccion}</dd></div>
          <div><dt className="text-slate-500">Valor</dt><dd className="font-medium text-slate-900">{textoPago}</dd></div>
        </dl>
        {(c.estado === "agendada" || c.estado === "confirmada") && (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Llega 15 minutos antes con tu cédula de identidad.
            {c.pago?.estado !== "pagado" && " Si te atiendes con Fonasa, el bono se compra en la clínica."}
          </p>
        )}
      </div>

      {c.puedePagar && (
        <Form method="post" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <input type="hidden" name="intent" value="pagar" />
          <p className="text-sm text-amber-900">
            Tu hora está retenida hasta las {new Date(c.reservaExpiraEn!).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}.
            Completa el pago para confirmarla.
          </p>
          <button className="mt-3 w-full rounded-lg bg-marca-600 px-4 py-3 font-medium text-white hover:bg-marca-700">
            Pagar {formatearPesos(c.precio)} con Webpay
          </button>
        </Form>
      )}

      {c.gestionable && (
        <div className={`mt-6 grid gap-3 ${c.reagendable ? "sm:grid-cols-2" : ""}`}>
          {c.reagendable && (
            <Link to={`/agendar?reagendar=${params.token}`} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-medium hover:bg-slate-50">
              Cambiar hora
            </Link>
          )}
          <details className="group rounded-lg border border-rose-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-center font-medium text-rose-700">Anular hora</summary>
            <Form method="post" className="space-y-3 border-t border-rose-100 p-4">
              <input type="hidden" name="intent" value="anular" />
              {c.sinDevolucion && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Faltan menos de {c.horasDevolucion} horas para tu hora: si la anulas, el pago no se devuelve.
                </p>
              )}
              <label className="block text-sm">
                <span className="text-slate-600">Motivo (opcional)</span>
                <input name="motivo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <button className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">Sí, anular mi hora</button>
            </Form>
          </details>
        </div>
      )}
      {actionData?.error && <div className="mt-4"><Aviso tipo="error">{actionData.error}</Aviso></div>}

      {c.estado === "cancelada" && (
        <p className="mt-6 text-center">
          <Link to="/agendar" className="rounded-lg bg-marca-600 px-5 py-2.5 font-medium text-white hover:bg-marca-700">Agendar otra hora</Link>
        </p>
      )}

      <p className="mt-8 text-center text-sm text-slate-500">
        Guarda este enlace: con él puedes revisar, cambiar o anular tu hora.
        {busqueda.has("nueva") && " También te lo enviamos por correo."}
      </p>
      <p className="mt-2 text-center text-sm">
        <Link to="/ingresar/paciente" className="text-marca-700 underline">Ir a Mi cuenta</Link>
      </p>
    </div>
  );
}

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  nueva: { tipo: "ok", texto: "¡Listo! Tu hora quedó reservada." },
  reagendada: { tipo: "ok", texto: "Tu hora fue cambiada." },
  anulada: { tipo: "ok", texto: "Tu hora fue anulada." },
  devolucion: { tipo: "ok", texto: "Tu hora fue anulada y te devolveremos el pago a tu tarjeta." },
  pagado: { tipo: "ok", texto: "¡Pago recibido! Tu hora quedó reservada." },
  rechazado: { tipo: "error", texto: "El pago fue rechazado y la hora se liberó. Puedes intentar de nuevo o reservar pagando en la clínica." },
  anulado: { tipo: "error", texto: "Anulaste el pago y la hora se liberó." },
  expirado: { tipo: "error", texto: "El plazo para pagar venció y la hora se liberó. Te devolveremos el pago a tu tarjeta." },
  procesando: { tipo: "ok", texto: "Estamos confirmando tu pago. Actualiza esta página en unos segundos." },
};

function MensajeEstado() {
  const [p] = useSearchParams();
  const clave = p.get("pago") ?? (p.has("devolucion") ? "devolucion" : ["nueva", "reagendada", "anulada"].find((k) => p.has(k)));
  const mensaje = clave ? MENSAJES[clave] : null;
  return mensaje ? <div className="mb-6"><Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso></div> : null;
}
