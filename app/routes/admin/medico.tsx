import { and, asc, count, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { data, Form, Link, useSearchParams } from "react-router";
import { z } from "zod";
import { Aviso, Boton, Campo, CampoSelect, CampoTexto, Casilla, Seccion, type ResultadoAccion } from "~/components/formulario";
import {
  bloqueosAgenda,
  citas,
  especialidades,
  horariosMedico,
  medicoEspecialidades,
  medicos,
  user,
} from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { aInstante, formatearFechaHora } from "~/lib/fechas";
import { esViolacionUnica, validar } from "~/lib/formularios";
import { formatearRut } from "~/lib/rut";
import { requerirRol } from "~/lib/sesion.server";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { esquemaMedico } from "~/modules/medicos";
import { aMinutos, bloquesSeSuperponen, DIAS_SEMANA, ORDEN_DIAS } from "~/modules/horarios";
import type { Route } from "./+types/medico";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin")];

export function meta() {
  return [{ title: "Médico · Administración" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  if (!z.uuid().safeParse(params.id).success) throw new Response("No encontrado", { status: 404 });

  const [medico] = await db.select().from(medicos).where(eq(medicos.id, params.id));
  if (!medico) throw new Response("No encontrado", { status: 404 });

  const [todas, asignadas, horarios, bloqueos] = await Promise.all([
    db.select({ id: especialidades.id, nombre: especialidades.nombre, activa: especialidades.activa }).from(especialidades).orderBy(asc(especialidades.nombre)),
    db.select({ id: medicoEspecialidades.especialidadId }).from(medicoEspecialidades).where(eq(medicoEspecialidades.medicoId, medico.id)),
    db.select().from(horariosMedico).where(eq(horariosMedico.medicoId, medico.id)),
    db
      .select()
      .from(bloqueosAgenda)
      .where(and(eq(bloqueosAgenda.medicoId, medico.id), gte(bloqueosAgenda.fin, new Date())))
      .orderBy(asc(bloqueosAgenda.inicio)),
  ]);

  const asignadasIds = new Set(asignadas.map((a) => a.id));
  return {
    medico,
    todas: todas.filter((e) => e.activa || asignadasIds.has(e.id)),
    asignadas: [...asignadasIds],
    horarios: horarios
      .map((h) => ({ ...h, horaInicio: h.horaInicio.slice(0, 5), horaFin: h.horaFin.slice(0, 5) }))
      .sort((a, b) => ORDEN_DIAS.indexOf(a.diaSemana) - ORDEN_DIAS.indexOf(b.diaSemana) || a.horaInicio.localeCompare(b.horaInicio)),
    bloqueos,
  };
}

const hora = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida");
const fechaHora = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora inválidas");
const idEsquema = z.uuid();

const esquemaHorario = z.object({
  diaSemana: z.coerce.number().int().min(0).max(6),
  horaInicio: hora,
  horaFin: hora,
  duracionMinutos: z.coerce.number("Ingresa la duración").int().min(5, "Mínimo 5 minutos").max(240),
  especialidadId: idEsquema,
});

const esquemaBloqueo = z.object({
  inicio: fechaHora,
  fin: fechaHora,
  motivo: z.string().trim().optional().transform((v) => v || null),
});

/** El valor de <input type="datetime-local"> está en hora de Chile. */
function desdeInputLocal(valor: string): Date {
  const [fecha, horaTexto] = valor.split("T");
  return aInstante(fecha, horaTexto);
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const admin = context.get(contextoUsuario);
  const medicoId = params.id;
  const [medico] = await db.select().from(medicos).where(eq(medicos.id, medicoId));
  if (!medico) throw new Response("No encontrado", { status: 404 });

  const formulario = await request.formData();
  const intencion = String(formulario.get("intent"));
  const auditar = (accion: string, detalle?: Record<string, unknown>) =>
    registrarAuditoria(db, request, { usuarioId: admin.id, accion, entidad: "medico", entidadId: medicoId, detalle: { seccion: intencion, ...detalle } });
  const fallo = (seccion: string, errores?: Record<string, string>, error?: string) =>
    data<ResultadoAccion>({ seccion, errores, error }, { status: 400 });

  switch (intencion) {
    case "datos": {
      const r = validar(esquemaMedico, formulario);
      if (!r.ok) return fallo("datos", r.errores);
      const d = r.datos;
      try {
        await db.update(medicos).set({ ...d }).where(eq(medicos.id, medicoId));
        if (medico.userId) {
          await db.update(user).set({ name: `${d.nombres} ${d.apellidos}`, email: d.email }).where(eq(user.id, medico.userId));
        }
      } catch (error) {
        if (esViolacionUnica(error)) return fallo("datos", { email: "Ese correo ya está en uso" });
        throw error;
      }
      await auditar("actualizar");
      return data<ResultadoAccion>({ seccion: "datos", ok: "Datos guardados" });
    }

    case "especialidades": {
      const r = validar(z.object({ especialidades: z.array(idEsquema).min(1, "Elige al menos una especialidad") }), formulario, ["especialidades"]);
      if (!r.ok) return fallo("especialidades", r.errores);
      const nuevas = new Set(r.datos.especialidades);
      const actuales = await db.select({ id: medicoEspecialidades.especialidadId }).from(medicoEspecialidades).where(eq(medicoEspecialidades.medicoId, medicoId));
      const quitadas = actuales.map((a) => a.id).filter((id) => !nuevas.has(id));
      if (quitadas.length) {
        const [{ n }] = await db
          .select({ n: count() })
          .from(horariosMedico)
          .where(and(eq(horariosMedico.medicoId, medicoId), inArray(horariosMedico.especialidadId, quitadas)));
        if (n > 0) return fallo("especialidades", undefined, "Una especialidad que quitas tiene horarios. Elimina esos horarios primero.");
        await db.delete(medicoEspecialidades).where(and(eq(medicoEspecialidades.medicoId, medicoId), inArray(medicoEspecialidades.especialidadId, quitadas)));
      }
      const agregadas = [...nuevas].filter((id) => !actuales.some((a) => a.id === id));
      if (agregadas.length) {
        await db.insert(medicoEspecialidades).values(agregadas.map((especialidadId) => ({ medicoId, especialidadId })));
      }
      await auditar("actualizar", { agregadas: agregadas.length, quitadas: quitadas.length });
      return data<ResultadoAccion>({ seccion: "especialidades", ok: "Especialidades guardadas" });
    }

    case "estado": {
      await db.update(medicos).set({ activo: !medico.activo }).where(eq(medicos.id, medicoId));
      await auditar(medico.activo ? "desactivar" : "activar");
      return data<ResultadoAccion>({ seccion: "estado", ok: medico.activo ? "Médico desactivado" : "Médico activado" });
    }

    case "agregar_horario": {
      const r = validar(esquemaHorario, formulario);
      if (!r.ok) return fallo("horario", r.errores);
      const h = r.datos;
      if (aMinutos(h.horaFin) <= aMinutos(h.horaInicio)) return fallo("horario", { horaFin: "Debe ser posterior al inicio" });
      if (aMinutos(h.horaFin) - aMinutos(h.horaInicio) < h.duracionMinutos) return fallo("horario", { duracionMinutos: "Es más larga que el bloque" });

      const [asignada] = await db
        .select()
        .from(medicoEspecialidades)
        .where(and(eq(medicoEspecialidades.medicoId, medicoId), eq(medicoEspecialidades.especialidadId, h.especialidadId)));
      if (!asignada) return fallo("horario", { especialidadId: "El médico no tiene esa especialidad" });

      const existentes = await db.select().from(horariosMedico).where(and(eq(horariosMedico.medicoId, medicoId), eq(horariosMedico.diaSemana, h.diaSemana)));
      if (existentes.some((e) => bloquesSeSuperponen(e, h))) {
        return fallo("horario", { horaInicio: "Se cruza con otro horario del mismo día" });
      }
      await db.insert(horariosMedico).values({ medicoId, ...h });
      await auditar("agregar_horario", { dia: h.diaSemana, desde: h.horaInicio, hasta: h.horaFin });
      return data<ResultadoAccion>({ seccion: "horario", ok: "Horario agregado" });
    }

    case "eliminar_horario": {
      const id = idEsquema.safeParse(formulario.get("id"));
      if (!id.success) return fallo("horarios", undefined, "Horario no válido");
      await db.delete(horariosMedico).where(and(eq(horariosMedico.id, id.data), eq(horariosMedico.medicoId, medicoId)));
      await auditar("eliminar_horario", { horarioId: id.data });
      return data<ResultadoAccion>({ seccion: "horarios", ok: "Horario eliminado" });
    }

    case "agregar_bloqueo": {
      const r = validar(esquemaBloqueo, formulario);
      if (!r.ok) return fallo("bloqueo", r.errores);
      const inicio = desdeInputLocal(r.datos.inicio);
      const fin = desdeInputLocal(r.datos.fin);
      if (fin <= inicio) return fallo("bloqueo", { fin: "Debe ser posterior al inicio" });

      await db.insert(bloqueosAgenda).values({ medicoId, inicio, fin, motivo: r.datos.motivo });
      const [{ n }] = await db
        .select({ n: count() })
        .from(citas)
        .where(and(eq(citas.medicoId, medicoId), lt(citas.inicio, fin), gt(citas.fin, inicio), inArray(citas.estado, ["pendiente_pago", "agendada", "confirmada"])));
      await auditar("agregar_bloqueo", { inicio, fin, citasAfectadas: n });
      return data<ResultadoAccion>({
        seccion: "bloqueo",
        ok: n > 0 ? `Bloqueo creado. Hay ${n} cita(s) agendada(s) en ese período: recepción debe reagendarlas.` : "Bloqueo creado",
      });
    }

    case "eliminar_bloqueo": {
      const id = idEsquema.safeParse(formulario.get("id"));
      if (!id.success) return fallo("bloqueos", undefined, "Bloqueo no válido");
      await db.delete(bloqueosAgenda).where(and(eq(bloqueosAgenda.id, id.data), eq(bloqueosAgenda.medicoId, medicoId)));
      await auditar("eliminar_bloqueo", { bloqueoId: id.data });
      return data<ResultadoAccion>({ seccion: "bloqueos", ok: "Bloqueo eliminado" });
    }
  }
  return fallo("", undefined, "Acción no válida");
}

function Resultado({ r, seccion }: { r?: ResultadoAccion; seccion: string }) {
  if (r?.seccion !== seccion) return null;
  if (r.ok) return <Aviso tipo="ok">{r.ok}</Aviso>;
  if (r.error) return <Aviso tipo="error">{r.error}</Aviso>;
  return null;
}

export default function MedicoDetalle({ loaderData, actionData }: Route.ComponentProps) {
  const { medico, todas, asignadas, horarios, bloqueos } = loaderData;
  const r = actionData as ResultadoAccion | undefined;
  const errores = (seccion: string) => (r?.seccion === seccion ? (r.errores ?? {}) : {});
  const asignadasSet = new Set(asignadas);
  const nombreEspecialidad = new Map(todas.map((e) => [e.id, e.nombre]));
  const [busqueda] = useSearchParams();
  const esNuevo = busqueda.has("nuevo");

  return (
    <>
      <Link to="/admin/medicos" className="text-sm text-marca-700 hover:underline">
        ← Médicos
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {medico.nombres} {medico.apellidos}
          </h1>
          <p className="text-sm text-slate-500">{formatearRut(medico.rut)}</p>
        </div>
        <Form method="post" className="flex items-center gap-3">
          <input type="hidden" name="intent" value="estado" />
          <Resultado r={r} seccion="estado" />
          <span className={`rounded-full px-2.5 py-1 text-xs ${medico.activo ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
            {medico.activo ? "Activo" : "Inactivo"}
          </span>
          <Boton variante={medico.activo ? "peligro" : "secundario"}>{medico.activo ? "Desactivar" : "Activar"}</Boton>
        </Form>
      </div>

      {esNuevo && (
        <div className="mt-4">
          <Aviso tipo="ok">Médico creado. Ahora define sus horarios de atención para que aparezca en la agenda.</Aviso>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Seccion titulo="Horarios de atención" descripcion="Bloques semanales. Las horas disponibles se calculan a partir de ellos.">
          <div className="mb-4"><Resultado r={r} seccion="horarios" /></div>
          {horarios.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Aún no tiene horarios: no aparecerá con horas disponibles.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {horarios.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="inline-block w-24 font-medium text-slate-900">{DIAS_SEMANA[h.diaSemana]}</span>
                    {h.horaInicio} – {h.horaFin} · cada {h.duracionMinutos} min
                    {h.especialidadId && <span className="text-slate-400"> · {nombreEspecialidad.get(h.especialidadId)}</span>}
                  </span>
                  <Form method="post">
                    <input type="hidden" name="intent" value="eliminar_horario" />
                    <input type="hidden" name="id" value={h.id} />
                    <button className="text-rose-600 hover:underline">Eliminar</button>
                  </Form>
                </li>
              ))}
            </ul>
          )}

          <Form method="post" className="mt-5 grid items-start gap-4 sm:grid-cols-6">
            <input type="hidden" name="intent" value="agregar_horario" />
            <CampoSelect etiqueta="Día" name="diaSemana" className="sm:col-span-1">
              {ORDEN_DIAS.map((d) => (
                <option key={d} value={d}>{DIAS_SEMANA[d]}</option>
              ))}
            </CampoSelect>
            <Campo etiqueta="Desde" name="horaInicio" type="time" defaultValue="09:00" error={errores("horario").horaInicio} />
            <Campo etiqueta="Hasta" name="horaFin" type="time" defaultValue="13:00" error={errores("horario").horaFin} />
            <Campo etiqueta="Minutos por cita" name="duracionMinutos" type="number" defaultValue={30} error={errores("horario").duracionMinutos} />
            <CampoSelect etiqueta="Especialidad" name="especialidadId" error={errores("horario").especialidadId} className="sm:col-span-1">
              {todas.filter((e) => asignadasSet.has(e.id)).map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </CampoSelect>
            <div className="self-end"><Boton variante="secundario" className="w-full">Agregar</Boton></div>
          </Form>
          <div className="mt-3"><Resultado r={r} seccion="horario" /></div>
        </Seccion>

        <Seccion titulo="Bloqueos de agenda" descripcion="Vacaciones, licencias, congresos u otros períodos sin atención.">
          <div className="mb-4"><Resultado r={r} seccion="bloqueos" /></div>
          {bloqueos.length > 0 && (
            <ul className="mb-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {bloqueos.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span>{formatearFechaHora(new Date(b.inicio))}</span> → <span>{formatearFechaHora(new Date(b.fin))}</span>
                    {b.motivo && <span className="text-slate-400"> · {b.motivo}</span>}
                  </span>
                  <Form method="post">
                    <input type="hidden" name="intent" value="eliminar_bloqueo" />
                    <input type="hidden" name="id" value={b.id} />
                    <button className="text-rose-600 hover:underline">Eliminar</button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
          <Form method="post" className="grid items-start gap-4 sm:grid-cols-4">
            <input type="hidden" name="intent" value="agregar_bloqueo" />
            <Campo etiqueta="Desde" name="inicio" type="datetime-local" error={errores("bloqueo").inicio} required />
            <Campo etiqueta="Hasta" name="fin" type="datetime-local" error={errores("bloqueo").fin} required />
            <Campo etiqueta="Motivo" name="motivo" placeholder="Vacaciones" />
            <div className="self-end"><Boton variante="secundario" className="w-full">Bloquear</Boton></div>
          </Form>
          <div className="mt-3"><Resultado r={r} seccion="bloqueo" /></div>
        </Seccion>

        <Seccion titulo="Especialidades">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="especialidades" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {todas.map((e) => (
                <Casilla key={e.id} etiqueta={e.nombre} name="especialidades" value={e.id} defaultChecked={asignadasSet.has(e.id)} />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Boton>Guardar especialidades</Boton>
              <Resultado r={r} seccion="especialidades" />
            </div>
          </Form>
        </Seccion>

        <Seccion titulo="Datos del médico">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="datos" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombres" name="nombres" defaultValue={medico.nombres} error={errores("datos").nombres} required />
              <Campo etiqueta="Apellidos" name="apellidos" defaultValue={medico.apellidos} error={errores("datos").apellidos} required />
              <Campo etiqueta="Correo" name="email" type="email" defaultValue={medico.email} error={errores("datos").email} required />
              <Campo etiqueta="Teléfono" name="telefono" type="tel" defaultValue={medico.telefono ?? ""} />
              <Campo etiqueta="Registro Superintendencia de Salud" name="registroSis" defaultValue={medico.registroSis ?? ""} />
              <Casilla etiqueta="Atiende con bono Fonasa" name="atiendeFonasa" defaultChecked={medico.atiendeFonasa} className="self-end pb-2" />
            </div>
            <CampoTexto etiqueta="Presentación" name="biografia" defaultValue={medico.biografia ?? ""} />
            <div className="flex items-center gap-3">
              <Boton>Guardar datos</Boton>
              <Resultado r={r} seccion="datos" />
            </div>
          </Form>
        </Seccion>
      </div>
    </>
  );
}
