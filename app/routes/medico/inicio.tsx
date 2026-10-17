import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { estiloEstadoCita, textoEstadoCita } from "~/components/panel";
import { citas, especialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { aInstante, fechaLocal, formatearFechaHora, formatearHora, sumarDias } from "~/lib/fechas";
import { formatearRut } from "~/lib/rut";
import type { Route } from "./+types/inicio";

export function meta() {
  return [{ title: "Mi agenda · Portal médico" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);

  const [medico] = await db.select().from(medicos).where(eq(medicos.userId, usuario.id));
  if (!medico) throw new Response("El usuario no está asociado a un médico", { status: 403 });

  const hoy = fechaLocal(new Date());
  const citasHoy = await db
    .select({
      id: citas.id,
      inicio: citas.inicio,
      estado: citas.estado,
      motivo: citas.motivoConsulta,
      rut: pacientes.rut,
      nombres: pacientes.nombres,
      apellidos: pacientes.apellidos,
      especialidad: especialidades.nombre,
    })
    .from(citas)
    .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .where(
      and(
        eq(citas.medicoId, medico.id),
        ne(citas.estado, "cancelada"),
        gte(citas.inicio, aInstante(hoy, "00:00")),
        lt(citas.inicio, aInstante(sumarDias(hoy, 1), "00:00")),
      ),
    )
    .orderBy(asc(citas.inicio));

  return { medico, citasHoy, ahora: new Date() };
}

export default function InicioMedico({ loaderData }: Route.ComponentProps) {
  const { medico, citasHoy, ahora } = loaderData;
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">
        Hola, Dr(a). {medico.apellidos.split(" ")[0]}
      </h1>
      <p className="mt-1 capitalize text-slate-500">{formatearFechaHora(new Date(ahora)).split(",")[0]}</p>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Pacientes de hoy</h2>
      <div className="mt-4 space-y-3">
        {citasHoy.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
            No tienes pacientes agendados para hoy.
          </p>
        )}
        {citasHoy.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4"
          >
            <div className="flex items-center gap-5">
              <span className="w-14 text-lg font-semibold text-slate-900">
                {formatearHora(new Date(c.inicio))}
              </span>
              <div>
                <p className="font-medium text-slate-900">
                  {c.nombres} {c.apellidos}
                </p>
                <p className="text-sm text-slate-500">
                  {formatearRut(c.rut)} · {c.especialidad}
                  {c.motivo && ` · ${c.motivo}`}
                </p>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs ${estiloEstadoCita[c.estado]}`}>
              {textoEstadoCita[c.estado]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-400">La ficha clínica de cada paciente llega en la Fase 5.</p>
    </>
  );
}
