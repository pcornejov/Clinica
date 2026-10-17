import { and, asc, eq } from "drizzle-orm";
import { Form, Link, useSearchParams } from "react-router";
import { z } from "zod";
import { clinica } from "~/config/clinica";
import { citas, especialidades, medicoEspecialidades, medicos } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { fechaLocal, formatearDia, formatearHora, formatearPesos, sumarDias } from "~/lib/fechas";
import { verificarTokenGestion } from "~/lib/token-gestion.server";
import { buscarCupos, ESTADOS_GESTIONABLES, ultimoDiaAgendable } from "~/modules/citas.server";
import type { Cupo } from "~/modules/disponibilidad";
import type { Route } from "./+types/agendar";

export function meta() {
  return [{ title: `Agenda tu hora · ${clinica.nombre}` }];
}

const DIAS_POR_PAGINA = 7;
const CUPOS_EXPRESS = 12;
const uuid = z.uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Modo = "especialidad" | "profesional" | "express";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db, env } = context.get(contextoApp);
  const url = new URL(request.url);
  const param = (k: string) => url.searchParams.get(k) || undefined;

  let modo: Modo = (["especialidad", "profesional", "express"] as const).find((m) => m === param("modo")) ?? "especialidad";
  let especialidadId = uuid.safeParse(param("especialidad")).data;
  let medicoId = uuid.safeParse(param("medico")).data;
  const prevision = param("prevision") ?? "";

  // Reagendar: se busca con el mismo médico y especialidad de la cita original.
  const tokenReagendar = param("reagendar");
  let reagendando: { token: string; inicio: string } | null = null;
  if (tokenReagendar) {
    const citaId = await verificarTokenGestion(tokenReagendar, env.BETTER_AUTH_SECRET);
    const [cita] = citaId ? await db.select().from(citas).where(eq(citas.id, citaId)) : [];
    if (!cita || !(ESTADOS_GESTIONABLES as readonly string[]).includes(cita.estado)) {
      throw new Response("La cita no se puede reagendar", { status: 404 });
    }
    reagendando = { token: tokenReagendar, inicio: cita.inicio.toISOString() };
    modo = "profesional";
    especialidadId = cita.especialidadId;
    medicoId = cita.medicoId;
  }

  const [listaEspecialidades, filasMedicos] = await Promise.all([
    db.select().from(especialidades).where(eq(especialidades.activa, true)).orderBy(asc(especialidades.nombre)),
    db
      .select({ id: medicos.id, nombres: medicos.nombres, apellidos: medicos.apellidos, especialidadId: medicoEspecialidades.especialidadId })
      .from(medicos)
      .innerJoin(medicoEspecialidades, eq(medicoEspecialidades.medicoId, medicos.id))
      .innerJoin(especialidades, eq(especialidades.id, medicoEspecialidades.especialidadId))
      .where(and(eq(medicos.activo, true), eq(especialidades.activa, true)))
      .orderBy(asc(medicos.apellidos)),
  ]);

  const listaMedicos = [...new Map(filasMedicos.map((m) => [m.id, { id: m.id, nombre: `${m.nombres} ${m.apellidos}` }])).values()];
  const especialidadesDelMedico = medicoId ? filasMedicos.filter((m) => m.id === medicoId).map((m) => m.especialidadId) : [];
  // Si el médico tiene una sola especialidad, se usa esa.
  if (modo === "profesional" && medicoId && !especialidadId && especialidadesDelMedico.length === 1) {
    especialidadId = especialidadesDelMedico[0];
  }
  if (modo !== "profesional") medicoId = undefined;

  const hoy = fechaLocal(new Date());
  const ultimoDia = ultimoDiaAgendable();
  let desde = fecha.safeParse(param("desde")).data ?? hoy;
  if (desde < hoy) desde = hoy;
  if (desde > ultimoDia) desde = ultimoDia;
  const hasta = modo === "express" ? ultimoDia : [sumarDias(desde, DIAS_POR_PAGINA - 1), ultimoDia].sort()[0];

  let cupos: Cupo[] = [];
  let primeraFechaConHoras: string | null = null;
  const buscar = especialidadId && (modo !== "profesional" || medicoId);
  if (buscar) {
    const filtro = {
      especialidadId: especialidadId!,
      medicoId,
      soloFonasa: prevision === "fonasa",
      excluirCitaId: undefined as string | undefined,
    };
    const resultado = await buscarCupos(db, { ...filtro, desde, hasta });
    cupos = modo === "express" ? resultado.cupos.slice(0, CUPOS_EXPRESS) : resultado.cupos;
    if (cupos.length === 0 && modo !== "express" && hasta < ultimoDia) {
      const siguiente = await buscarCupos(db, { ...filtro, desde: sumarDias(hasta, 1), hasta: ultimoDia });
      primeraFechaConHoras = siguiente.cupos[0] ? fechaLocal(siguiente.cupos[0].inicio) : null;
    }
  }

  // Agrupar por médico y día para mostrar.
  const nombreMedico = new Map(listaMedicos.map((m) => [m.id, m.nombre]));
  const porMedico = new Map<string, Map<string, { iso: string; hora: string }[]>>();
  for (const c of cupos) {
    const dia = fechaLocal(c.inicio);
    const dias = porMedico.get(c.medicoId) ?? new Map();
    dias.set(dia, [...(dias.get(dia) ?? []), { iso: c.inicio.toISOString(), hora: formatearHora(c.inicio) }]);
    porMedico.set(c.medicoId, dias);
  }
  const resultados = [...porMedico.entries()].map(([id, dias]) => ({
    medicoId: id,
    medico: nombreMedico.get(id) ?? "",
    dias: [...dias.entries()].map(([dia, horas]) => ({ fecha: dia, titulo: formatearDia(dia), horas })),
  }));
  const express = modo === "express"
    ? cupos.map((c) => ({ iso: c.inicio.toISOString(), medicoId: c.medicoId, medico: nombreMedico.get(c.medicoId) ?? "", dia: formatearDia(fechaLocal(c.inicio)), hora: formatearHora(c.inicio) }))
    : [];

  const especialidad = listaEspecialidades.find((e) => e.id === especialidadId);
  return {
    modo,
    filtros: { especialidadId: especialidadId ?? "", medicoId: medicoId ?? "", prevision },
    especialidades: listaEspecialidades.map((e) => ({ id: e.id, nombre: e.nombre })),
    medicos: listaMedicos,
    especialidadesDelMedico,
    especialidad: especialidad ? { nombre: especialidad.nombre, precio: especialidad.precio, duracion: especialidad.duracionMinutos } : null,
    buscado: !!buscar,
    rango: { desde, hasta, hoy, ultimoDia, anterior: desde > hoy ? [sumarDias(desde, -DIAS_POR_PAGINA), hoy].sort().reverse()[0] : null, siguiente: hasta < ultimoDia ? sumarDias(hasta, 1) : null },
    primeraFechaConHoras,
    resultados,
    express,
    reagendando,
  };
}

const estiloTab = (activo: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-medium ${activo ? "bg-marca-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
const estiloSelect =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100";

export default function Agendar({ loaderData }: Route.ComponentProps) {
  const d = loaderData;
  const [params] = useSearchParams();

  const urlCon = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/agendar?${p}`;
  };
  const urlHora = (iso: string, medicoId: string) =>
    d.reagendando
      ? `/cita/${d.reagendando.token}/reagendar?${new URLSearchParams({ inicio: iso })}`
      : `/agendar/confirmar?${new URLSearchParams({ especialidad: d.filtros.especialidadId, medico: medicoId, inicio: iso })}`;
  const urlListaEspera = `/agendar/lista-espera?${new URLSearchParams({ especialidad: d.filtros.especialidadId, ...(d.filtros.medicoId ? { medico: d.filtros.medicoId } : {}) })}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">{d.reagendando ? "Cambia tu hora" : "Agenda tu hora"}</h1>
      {d.reagendando && (
        <p className="mt-2 text-slate-600">
          Elige el nuevo horario. Tu hora actual se mantiene hasta que confirmes el cambio.{" "}
          <Link to={`/cita/${d.reagendando.token}`} className="text-marca-700 underline">Volver a mi cita</Link>
        </p>
      )}

      {!d.reagendando && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <nav className="flex flex-wrap gap-2" aria-label="Forma de búsqueda">
            <Link to={urlCon({ modo: "especialidad", medico: null, desde: null })} className={estiloTab(d.modo === "especialidad")}>Por especialidad</Link>
            <Link to={urlCon({ modo: "profesional", desde: null })} className={estiloTab(d.modo === "profesional")}>Por profesional</Link>
            <Link to={urlCon({ modo: "express", medico: null, desde: null })} className={estiloTab(d.modo === "express")}>Primera hora disponible</Link>
          </nav>

          <Form method="get" className="mt-5 grid gap-4 sm:grid-cols-4" key={d.modo}>
            <input type="hidden" name="modo" value={d.modo} />
            {d.modo === "profesional" ? (
              <>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Profesional</span>
                  <select name="medico" defaultValue={d.filtros.medicoId} className={estiloSelect} required>
                    <option value="">Elige un profesional</option>
                    {d.medicos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </label>
                {d.especialidadesDelMedico.length > 1 && (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Especialidad</span>
                    <select name="especialidad" defaultValue={d.filtros.especialidadId} className={estiloSelect} required>
                      <option value="">Elige</option>
                      {d.especialidades.filter((e) => d.especialidadesDelMedico.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">Especialidad</span>
                <select name="especialidad" defaultValue={d.filtros.especialidadId} className={estiloSelect} required>
                  <option value="">Elige una especialidad</option>
                  {d.especialidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Previsión <span className="font-normal text-slate-400">(opcional)</span></span>
              <select name="prevision" defaultValue={d.filtros.prevision} className={estiloSelect}>
                <option value="">Cualquiera</option>
                <option value="fonasa">Fonasa</option>
                <option value="isapre">Isapre</option>
                <option value="particular">Particular</option>
              </select>
            </label>
            <div className="self-end">
              <button className="w-full rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700">Buscar horas</button>
            </div>
          </Form>
          {d.filtros.prevision === "fonasa" && (
            <p className="mt-3 text-xs text-slate-500">Mostrando solo profesionales que atienden con bono Fonasa.</p>
          )}
        </div>
      )}

      {d.buscado && d.especialidad && (
        <div className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{d.especialidad.nombre}</h2>
              <p className="text-sm text-slate-500">
                Consulta de {d.especialidad.duracion} min · {formatearPesos(d.especialidad.precio)} · pago en la clínica
              </p>
            </div>
            {d.modo !== "express" && (
              <div className="flex items-center gap-2 text-sm">
                {d.rango.anterior ? <Link to={urlCon({ desde: d.rango.anterior })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">← Anterior</Link> : null}
                <span className="text-slate-500">{formatearDia(d.rango.desde)} – {formatearDia(d.rango.hasta)}</span>
                {d.rango.siguiente ? <Link to={urlCon({ desde: d.rango.siguiente })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Siguiente →</Link> : null}
              </div>
            )}
          </div>

          {d.modo === "express" && d.express.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.express.map((c) => (
                <Link key={`${c.medicoId}-${c.iso}`} to={urlHora(c.iso, c.medicoId)} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-marca-500 hover:shadow-sm">
                  <p className="text-lg font-semibold text-slate-900">{c.hora}</p>
                  <p className="text-sm text-slate-600">{c.dia}</p>
                  <p className="mt-1 text-sm text-marca-700">{c.medico}</p>
                </Link>
              ))}
            </div>
          )}

          {d.modo !== "express" && d.resultados.map((r) => (
            <div key={r.medicoId} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-medium text-slate-900">{r.medico}</p>
              <div className="mt-4 space-y-4">
                {r.dias.map((dia) => (
                  <div key={dia.fecha}>
                    <p className="text-sm font-medium text-slate-600">{dia.titulo}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dia.horas.map((h) => (
                        <Link key={h.iso} to={urlHora(h.iso, r.medicoId)} className="rounded-lg border border-marca-100 bg-marca-50 px-3 py-1.5 text-sm font-medium text-marca-700 hover:border-marca-500">
                          {h.hora}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {d.resultados.length === 0 && d.express.length === 0 && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <p className="font-medium text-slate-900">No hay horas disponibles en estas fechas.</p>
              {d.primeraFechaConHoras ? (
                <Link to={urlCon({ desde: d.primeraFechaConHoras })} className="mt-3 inline-block text-marca-700 underline">
                  Ver la próxima fecha con horas ({formatearDia(d.primeraFechaConHoras)})
                </Link>
              ) : (
                !d.reagendando && (
                  <p className="mt-2 text-slate-600">
                    Inscríbete en la{" "}
                    <Link to={urlListaEspera} className="text-marca-700 underline">lista de espera</Link>{" "}
                    y te avisaremos si se libera una hora.
                  </p>
                )
              )}
            </div>
          )}

          {!d.reagendando && (d.resultados.length > 0 || d.express.length > 0) && (
            <p className="mt-6 text-center text-sm text-slate-500">
              ¿No te acomoda ninguna? <Link to={urlListaEspera} className="text-marca-700 underline">Inscríbete en la lista de espera</Link>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
