import { asc, eq } from "drizzle-orm";
import { clinica } from "~/config/clinica";
import { especialidades } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { formatearPesos } from "~/lib/fechas";
import type { Route } from "./+types/especialidades";

export function meta() {
  return [{ title: `Especialidades · ${clinica.nombre}` }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const lista = await db
    .select()
    .from(especialidades)
    .where(eq(especialidades.activa, true))
    .orderBy(asc(especialidades.nombre));
  return { especialidades: lista };
}

export default function Especialidades({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-slate-900">Especialidades</h1>
      <p className="mt-2 text-slate-600">
        Elige una especialidad para ver los médicos disponibles. La reserva en línea estará
        disponible próximamente.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {loaderData.especialidades.map((e) => (
          <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-medium text-slate-900">{e.nombre}</h2>
              <span className="whitespace-nowrap text-sm text-marca-700">
                {formatearPesos(e.precio)}
              </span>
            </div>
            <p className="mt-2 text-slate-600">{e.descripcion}</p>
            <p className="mt-3 text-sm text-slate-400">Consulta de {e.duracionMinutos} minutos</p>
          </div>
        ))}
      </div>
    </div>
  );
}
