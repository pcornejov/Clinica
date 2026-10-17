import { asc, eq } from "drizzle-orm";
import { Link } from "react-router";
import { clinica } from "~/config/clinica";
import { especialidades, medicoEspecialidades, medicos } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import type { Route } from "./+types/medicos";

export function meta() {
  return [{ title: `Médicos · ${clinica.nombre}` }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const filas = await db
    .select({
      id: medicos.id,
      nombres: medicos.nombres,
      apellidos: medicos.apellidos,
      biografia: medicos.biografia,
      especialidad: especialidades.nombre,
    })
    .from(medicos)
    .innerJoin(medicoEspecialidades, eq(medicoEspecialidades.medicoId, medicos.id))
    .innerJoin(especialidades, eq(especialidades.id, medicoEspecialidades.especialidadId))
    .where(eq(medicos.activo, true))
    .orderBy(asc(medicos.apellidos), asc(especialidades.nombre));

  const porMedico = new Map<string, (typeof filas)[number] & { especialidades: string[] }>();
  for (const f of filas) {
    const existente = porMedico.get(f.id);
    if (existente) existente.especialidades.push(f.especialidad);
    else porMedico.set(f.id, { ...f, especialidades: [f.especialidad] });
  }
  return { medicos: [...porMedico.values()] };
}

function iniciales(nombres: string, apellidos: string) {
  return `${nombres[0] ?? ""}${apellidos[0] ?? ""}`;
}

export default function Medicos({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-slate-900">Nuestros médicos</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loaderData.medicos.map((m) => (
          <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-marca-100 font-semibold text-marca-700">
                {iniciales(m.nombres, m.apellidos)}
              </div>
              <div>
                <p className="font-medium text-slate-900">
                  {m.nombres} {m.apellidos}
                </p>
                <p className="text-sm text-marca-700">{m.especialidades.join(" · ")}</p>
              </div>
            </div>
            {m.biografia && <p className="mt-4 text-sm text-slate-600">{m.biografia}</p>}
            <Link to={`/agendar?modo=profesional&medico=${m.id}`} className="mt-4 inline-block text-sm font-medium text-marca-700 hover:underline">Ver horas →</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
