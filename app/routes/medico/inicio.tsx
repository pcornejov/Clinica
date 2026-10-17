import { and, asc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { estiloEstadoCita, textoEstadoCita } from "~/components/panel";
import { atenciones, citas, especialidades, fichasClinicas, pacientes } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { aInstante, fechaLocal, formatearDia, formatearHora, sumarDias } from "~/lib/fechas";
import { formatearRut } from "~/lib/rut";
import { edad, medicoDeUsuario } from "~/modules/fichas.server";
import type { Route } from "./+types/inicio";

export function meta() {
  return [{ title: "Mi agenda · Portal médico" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const medico = await medicoDeUsuario(db, context.get(contextoUsuario).id);
  const hoy = fechaLocal(new Date());
  const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(new URL(request.url).searchParams.get("fecha")).data ?? hoy;

  const lista = await db
    .select({
      id: citas.id,
      inicio: citas.inicio,
      estado: citas.estado,
      sobrecupo: citas.sobrecupo,
      motivo: citas.motivoConsulta,
      pacienteId: pacientes.id,
      rut: pacientes.rut,
      nombres: pacientes.nombres,
      apellidos: pacientes.apellidos,
      fechaNacimiento: pacientes.fechaNacimiento,
      especialidad: especialidades.nombre,
    })
    .from(citas)
    .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .where(
      and(
        eq(citas.medicoId, medico.id),
        ne(citas.estado, "cancelada"),
        gte(citas.inicio, aInstante(fecha, "00:00")),
        lt(citas.inicio, aInstante(sumarDias(fecha, 1), "00:00")),
      ),
    )
    .orderBy(asc(citas.inicio));

  // Citas que ya tienen una atención registrada (borrador o firmada).
  const conAtencion = lista.length
    ? await db
        .select({ citaId: atenciones.citaId, estado: atenciones.estado })
        .from(atenciones)
        .where(inArray(atenciones.citaId, lista.map((c) => c.id)))
    : [];
  const estadoAtencion = new Map(conAtencion.map((a) => [a.citaId, a.estado]));

  // Alergias registradas, para tenerlas a la vista.
  const fichas = lista.length
    ? await db
        .select({ pacienteId: fichasClinicas.pacienteId, alergias: fichasClinicas.alergias })
        .from(fichasClinicas)
        .where(inArray(fichasClinicas.pacienteId, lista.map((c) => c.pacienteId)))
    : [];
  const alergias = new Map(fichas.map((f) => [f.pacienteId, f.alergias]));

  return {
    medico: { apellidos: medico.apellidos },
    fecha,
    hoy,
    citas: lista.map((c) => {
      const alergia = alergias.get(c.pacienteId);
      return {
        ...c,
        inicio: c.inicio.toISOString(),
        rut: formatearRut(c.rut),
        edad: edad(c.fechaNacimiento),
        atencion: estadoAtencion.get(c.id) ?? null,
        alergia: alergia && !/^no refiere$/i.test(alergia.trim()) ? alergia : null,
      };
    }),
  };
}

export default function InicioMedico({ loaderData }: Route.ComponentProps) {
  const { medico, citas: lista, fecha, hoy } = loaderData;
  const [params] = useSearchParams();
  const conFecha = (f: string) => {
    const p = new URLSearchParams(params);
    p.set("fecha", f);
    return `?${p}`;
  };
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Hola, Dr(a). {medico.apellidos.split(" ")[0]}</h1>
          <p className="mt-1 text-slate-500">{formatearDia(fecha)} · {lista.length} paciente(s)</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link to={conFecha(sumarDias(fecha, -1))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">← Anterior</Link>
          {fecha !== hoy && <Link to={conFecha(hoy)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Hoy</Link>}
          <Link to={conFecha(sumarDias(fecha, 1))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Siguiente →</Link>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {lista.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">No tienes pacientes agendados este día.</p>
        )}
        {lista.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center gap-5">
              <span className="w-14 text-lg font-semibold text-slate-900">{formatearHora(new Date(c.inicio))}</span>
              <div>
                <p className="font-medium text-slate-900">
                  {c.nombres} {c.apellidos}
                  {c.edad !== null && <span className="font-normal text-slate-500"> · {c.edad} años</span>}
                  {c.sobrecupo && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-normal text-violet-800">Sobrecupo</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {c.rut} · {c.especialidad}{c.motivo && ` · ${c.motivo}`}
                </p>
                {c.alergia && <p className="mt-1 text-xs font-medium text-rose-700">⚠ Alergias: {c.alergia}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-xs ${estiloEstadoCita[c.estado]}`}>{textoEstadoCita[c.estado]}</span>
              <Link to={`/medico/pacientes/${c.pacienteId}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Ficha</Link>
              {c.atencion === "firmada" ? (
                <span className="text-sm text-emerald-700">Atención registrada</span>
              ) : (
                <Link
                  to={`/medico/pacientes/${c.pacienteId}/atencion?cita=${c.id}`}
                  className="rounded-lg bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700"
                >
                  {c.atencion === "borrador" ? "Continuar atención" : "Atender"}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
