import { and, asc, count, eq, gte, lt } from "drizzle-orm";
import { estiloEstadoCita, Tarjeta, textoEstadoCita } from "~/components/panel";
import { citas, especialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { aInstante, fechaLocal, formatearHora, sumarDias } from "~/lib/fechas";
import type { Route } from "./+types/inicio";

export function meta() {
  return [{ title: "Resumen · Administración" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const hoy = fechaLocal(new Date());
  const desde = aInstante(hoy, "00:00");
  const hasta = aInstante(sumarDias(hoy, 1), "00:00");

  const [[totMedicos], [totEspecialidades], [totPacientes], citasHoy] = await Promise.all([
    db.select({ n: count() }).from(medicos).where(eq(medicos.activo, true)),
    db.select({ n: count() }).from(especialidades).where(eq(especialidades.activa, true)),
    db.select({ n: count() }).from(pacientes),
    db
      .select({
        id: citas.id,
        inicio: citas.inicio,
        estado: citas.estado,
        paciente: pacientes.nombres,
        pacienteApellidos: pacientes.apellidos,
        medico: medicos.nombres,
        medicoApellidos: medicos.apellidos,
        especialidad: especialidades.nombre,
      })
      .from(citas)
      .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
      .innerJoin(medicos, eq(medicos.id, citas.medicoId))
      .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
      .where(and(gte(citas.inicio, desde), lt(citas.inicio, hasta)))
      .orderBy(asc(citas.inicio)),
  ]);

  return {
    resumen: {
      medicos: totMedicos.n,
      especialidades: totEspecialidades.n,
      pacientes: totPacientes.n,
      citasHoy: citasHoy.filter((c) => c.estado !== "cancelada").length,
    },
    citasHoy,
  };
}

export default function InicioAdmin({ loaderData }: Route.ComponentProps) {
  const { resumen, citasHoy } = loaderData;
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Resumen</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Citas hoy" valor={resumen.citasHoy} />
        <Tarjeta titulo="Médicos activos" valor={resumen.medicos} />
        <Tarjeta titulo="Especialidades" valor={resumen.especialidades} />
        <Tarjeta titulo="Pacientes" valor={resumen.pacientes} />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-slate-900">Agenda de hoy</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Hora</th>
              <th className="px-4 py-3 font-medium">Paciente</th>
              <th className="px-4 py-3 font-medium">Médico</th>
              <th className="px-4 py-3 font-medium">Especialidad</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {citasHoy.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No hay citas para hoy.
                </td>
              </tr>
            )}
            {citasHoy.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{formatearHora(new Date(c.inicio))}</td>
                <td className="px-4 py-3">
                  {c.paciente} {c.pacienteApellidos}
                </td>
                <td className="px-4 py-3">
                  {c.medico} {c.medicoApellidos}
                </td>
                <td className="px-4 py-3">{c.especialidad}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${estiloEstadoCita[c.estado]}`}>
                    {textoEstadoCita[c.estado]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
