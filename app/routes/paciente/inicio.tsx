import { desc, eq } from "drizzle-orm";
import { estiloEstadoCita, textoEstadoCita } from "~/components/panel";
import { citas, especialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { formatearFechaHora } from "~/lib/fechas";
import type { Route } from "./+types/inicio";

export function meta() {
  return [{ title: "Mis citas" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);

  const lista = await db
    .select({
      id: citas.id,
      inicio: citas.inicio,
      estado: citas.estado,
      medico: medicos.nombres,
      medicoApellidos: medicos.apellidos,
      especialidad: especialidades.nombre,
    })
    .from(citas)
    .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
    .innerJoin(medicos, eq(medicos.id, citas.medicoId))
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .where(eq(pacientes.userId, usuario.id))
    .orderBy(desc(citas.inicio));

  return { citas: lista };
}

export default function MisCitas({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Mis citas</h1>
      <div className="mt-6 space-y-3">
        {loaderData.citas.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
            Aún no tienes citas.
          </p>
        )}
        {loaderData.citas.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4"
          >
            <div>
              <p className="font-medium capitalize text-slate-900">
                {formatearFechaHora(new Date(c.inicio))}
              </p>
              <p className="text-sm text-slate-500">
                {c.especialidad} · {c.medico} {c.medicoApellidos}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs ${estiloEstadoCita[c.estado]}`}>
              {textoEstadoCita[c.estado]}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
