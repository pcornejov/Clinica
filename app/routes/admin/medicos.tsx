import { asc, eq, sql } from "drizzle-orm";
import { Link } from "react-router";
import { especialidades, medicoEspecialidades, medicos } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { formatearRut } from "~/lib/rut";
import { requerirRol } from "~/lib/sesion.server";
import type { Route } from "./+types/medicos";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin")];

export function meta() {
  return [{ title: "Médicos · Administración" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const lista = await db
    .select({
      id: medicos.id,
      nombres: medicos.nombres,
      apellidos: medicos.apellidos,
      rut: medicos.rut,
      email: medicos.email,
      activo: medicos.activo,
      especialidades: sql<string | null>`string_agg(${especialidades.nombre}, ', ' order by ${especialidades.nombre})`,
    })
    .from(medicos)
    .leftJoin(medicoEspecialidades, eq(medicoEspecialidades.medicoId, medicos.id))
    .leftJoin(especialidades, eq(especialidades.id, medicoEspecialidades.especialidadId))
    .groupBy(medicos.id)
    .orderBy(asc(medicos.apellidos), asc(medicos.nombres));
  return { lista };
}

export default function Medicos({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Médicos</h1>
        <Link
          to="/admin/medicos/nuevo"
          className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700"
        >
          + Nuevo médico
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">RUT</th>
              <th className="px-4 py-3 font-medium">Especialidades</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loaderData.lista.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {m.nombres} {m.apellidos}
                  </p>
                  <p className="text-xs text-slate-400">{m.email}</p>
                </td>
                <td className="px-4 py-3">{formatearRut(m.rut)}</td>
                <td className="px-4 py-3">{m.especialidades ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${m.activo ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
                  >
                    {m.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/admin/medicos/${m.id}`} className="text-marca-700 hover:underline">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
