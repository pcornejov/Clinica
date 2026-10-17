import { eq } from "drizzle-orm";
import { data, Form, Link, redirect, useSearchParams } from "react-router";
import { estiloEstadoCita, textoEstadoCita } from "~/components/panel";
import { Aviso } from "~/components/formulario";
import { clinica } from "~/config/clinica";
import { citas, especialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { formatearFechaHora, formatearPesos } from "~/lib/fechas";
import { verificarTokenGestion } from "~/lib/token-gestion.server";
import { anularCita, ESTADOS_GESTIONABLES } from "~/modules/citas.server";
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
  const { cita, medico, especialidad, paciente } = await citaDesdeToken(context, params.token);
  const gestionable = (ESTADOS_GESTIONABLES as readonly string[]).includes(cita.estado) && cita.inicio > new Date();
  return {
    // Solo el primer nombre: el enlace podría reenviarse a otra persona.
    paciente,
    estado: cita.estado,
    inicio: cita.inicio.toISOString(),
    especialidad,
    medico: `${medico.nombres} ${medico.apellidos}`,
    precio: cita.precio,
    gestionable,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const { cita } = await citaDesdeToken(context, params.token);
  const formulario = await request.formData();
  if (formulario.get("intent") !== "anular") return data({ error: "Acción no válida" }, { status: 400 });
  const motivo = String(formulario.get("motivo") ?? "").trim().slice(0, 300) || null;
  const resultado = await anularCita(db, cita.id, motivo);
  if ("error" in resultado) return data({ error: resultado.error }, { status: 409 });
  return redirect(`/cita/${params.token}?anulada=1`);
}

export default function Cita({ loaderData, actionData, params }: Route.ComponentProps) {
  const c = loaderData;
  const [busqueda] = useSearchParams();
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
          <div><dt className="text-slate-500">Valor</dt><dd className="font-medium text-slate-900">{formatearPesos(c.precio)} · pago en la clínica</dd></div>
        </dl>
        {c.estado !== "cancelada" && (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Llega 15 minutos antes con tu cédula de identidad. Si te atiendes con Fonasa, el bono se compra en la clínica.
          </p>
        )}
      </div>

      {c.gestionable && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link to={`/agendar?reagendar=${params.token}`} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-medium hover:bg-slate-50">
            Cambiar hora
          </Link>
          <details className="group rounded-lg border border-rose-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-center font-medium text-rose-700">Anular hora</summary>
            <Form method="post" className="space-y-3 border-t border-rose-100 p-4">
              <input type="hidden" name="intent" value="anular" />
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

      <p className="mt-8 text-center text-sm text-slate-500">
        Guarda este enlace: con él puedes revisar, cambiar o anular tu hora.
        {busqueda.has("nueva") && " También puedes ingresar a Mi cuenta con tu correo."}
      </p>
      <p className="mt-2 text-center text-sm">
        <Link to="/ingresar/paciente" className="text-marca-700 underline">Ir a Mi cuenta</Link>
      </p>
    </div>
  );
}

function MensajeEstado() {
  const [p] = useSearchParams();
  const texto = p.has("nueva")
    ? "¡Listo! Tu hora quedó reservada."
    : p.has("reagendada")
      ? "Tu hora fue cambiada."
      : p.has("anulada")
        ? "Tu hora fue anulada."
        : null;
  return texto ? <div className="mb-6"><Aviso tipo="ok">{texto}</Aviso></div> : null;
}
