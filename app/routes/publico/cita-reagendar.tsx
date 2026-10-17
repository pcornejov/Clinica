import { eq } from "drizzle-orm";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { Aviso } from "~/components/formulario";
import { clinica } from "~/config/clinica";
import { citas, especialidades, medicos } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { fechaLocal, formatearFechaHora } from "~/lib/fechas";
import { verificarTokenGestion } from "~/lib/token-gestion.server";
import { buscarCupos, reagendarCita } from "~/modules/citas.server";
import type { Route } from "./+types/cita-reagendar";

export function meta() {
  return [{ title: `Cambiar hora · ${clinica.nombre}` }, { name: "robots", content: "noindex" }];
}

async function cargar({ params, request, context }: Route.LoaderArgs) {
  const { db, env } = context.get(contextoApp);
  const citaId = await verificarTokenGestion(params.token, env.BETTER_AUTH_SECRET);
  const inicioTexto = new URL(request.url).searchParams.get("inicio");
  if (!citaId || !z.iso.datetime().safeParse(inicioTexto).success) throw new Response("Enlace no válido", { status: 404 });
  const [fila] = await db
    .select({ cita: citas, medico: { nombres: medicos.nombres, apellidos: medicos.apellidos }, especialidad: especialidades.nombre })
    .from(citas)
    .innerJoin(medicos, eq(medicos.id, citas.medicoId))
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .where(eq(citas.id, citaId));
  if (!fila) throw new Response("Enlace no válido", { status: 404 });
  return { db, ...fila, nuevoInicio: new Date(inicioTexto!) };
}

export async function loader(args: Route.LoaderArgs) {
  const { db, cita, medico, especialidad, nuevoInicio } = await cargar(args);
  const fecha = fechaLocal(nuevoInicio);
  const { cupos } = await buscarCupos(db, {
    especialidadId: cita.especialidadId,
    medicoId: cita.medicoId,
    desde: fecha,
    hasta: fecha,
    excluirCitaId: cita.id,
  });
  return {
    actual: cita.inicio.toISOString(),
    nueva: nuevoInicio.toISOString(),
    disponible: cupos.some((c) => c.inicio.getTime() === nuevoInicio.getTime()),
    detalle: `${especialidad} · ${medico.nombres} ${medico.apellidos}`,
  };
}

export async function action(args: Route.ActionArgs) {
  const { db, cita, nuevoInicio } = await cargar(args);
  const resultado = await reagendarCita(db, cita.id, nuevoInicio);
  if ("error" in resultado) return data({ error: resultado.error }, { status: 409 });
  return redirect(`/cita/${args.params.token}?reagendada=1`);
}

export default function Reagendar({ loaderData, actionData, params }: Route.ComponentProps) {
  const d = loaderData;
  const enviando = useNavigation().state === "submitting";
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Link to={`/agendar?reagendar=${params.token}`} className="text-sm text-marca-700 hover:underline">← Elegir otra hora</Link>
      <h1 className="mt-2 text-3xl font-semibold text-slate-900">Confirma el cambio</h1>
      <p className="mt-2 text-slate-600">{d.detalle}</p>

      <div className="mt-6 space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Hora actual</p>
          <p className="font-medium text-slate-500 line-through">{formatearFechaHora(new Date(d.actual))}</p>
        </div>
        <div className="rounded-xl border border-marca-100 bg-marca-50 p-4">
          <p className="text-sm text-slate-500">Nueva hora</p>
          <p className="text-lg font-semibold text-slate-900">{formatearFechaHora(new Date(d.nueva))}</p>
        </div>
      </div>

      {!d.disponible && !actionData && <div className="mt-4"><Aviso tipo="error">Esta hora ya no está disponible. Elige otra.</Aviso></div>}
      {actionData?.error && <div className="mt-4"><Aviso tipo="error">{actionData.error}</Aviso></div>}

      {d.disponible && (
        <Form method="post" className="mt-6">
          <button disabled={enviando} className="w-full rounded-lg bg-marca-600 px-5 py-3 font-medium text-white hover:bg-marca-700 disabled:opacity-60">
            {enviando ? "Cambiando…" : "Confirmar cambio de hora"}
          </button>
        </Form>
      )}
    </div>
  );
}
