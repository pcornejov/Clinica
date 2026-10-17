import { and, asc, eq, gt, lt } from "drizzle-orm";
import { useEffect, useState } from "react";
import { data, Form, Link, useFetcher, useSearchParams } from "react-router";
import { z } from "zod";
import { Aviso, Campo, CampoSelect, type ResultadoAccion } from "~/components/formulario";
import { estiloEstadoCita, textoEstadoCita } from "~/components/panel";
import { bloqueosAgenda, citas, especialidades, horariosMedico, medicoEspecialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp, contextoUsuario, enSegundoPlano } from "~/lib/contexto";
import { aInstante, fechaLocal, formatearDia, formatearHora, sumarDias } from "~/lib/fechas";
import { validar } from "~/lib/formularios";
import { formatearRut, normalizarRut, validarRut } from "~/lib/rut";
import { formatearTelefono, normalizarTelefono } from "~/lib/telefono";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { procesarCola } from "~/modules/avisos/cola.server";
import { programarAvisosCita } from "~/modules/avisos/programar.server";
import { crearCita } from "~/modules/citas.server";
import { anularConDevolucion, pagosDeCitas, registrarPagoCaja, TEXTO_MEDIO } from "~/modules/pagos.server";
import { generarCupos } from "~/modules/disponibilidad";
import { asegurarCuentaPaciente, obtenerOCrearPaciente } from "~/modules/pacientes.server";
import type { Route } from "./+types/agenda";

export function meta() {
  return [{ title: "Agenda · Recepción" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const url = new URL(request.url);
  const hoy = fechaLocal(new Date());
  const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(url.searchParams.get("fecha")).data ?? hoy;

  const listaMedicos = await db
    .select({ id: medicos.id, nombres: medicos.nombres, apellidos: medicos.apellidos })
    .from(medicos)
    .where(eq(medicos.activo, true))
    .orderBy(asc(medicos.apellidos));
  const medicoId = listaMedicos.find((m) => m.id === url.searchParams.get("medico"))?.id ?? listaMedicos[0]?.id;
  if (!medicoId) return { fecha, hoy, medicoId: "", medicos: [], especialidades: [], filas: [] };

  const inicioDia = aInstante(fecha, "00:00");
  const finDia = aInstante(sumarDias(fecha, 1), "00:00");
  const [horarios, delDia, bloqueos, espMedico] = await Promise.all([
    db.select().from(horariosMedico).where(eq(horariosMedico.medicoId, medicoId)),
    db
      .select({
        id: citas.id,
        inicio: citas.inicio,
        fin: citas.fin,
        estado: citas.estado,
        sobrecupo: citas.sobrecupo,
        canal: citas.canal,
        requiereRevision: citas.requiereRevision,
        precio: citas.precio,
        motivo: citas.motivoConsulta,
        paciente: { nombres: pacientes.nombres, apellidos: pacientes.apellidos, rut: pacientes.rut, telefono: pacientes.telefono },
        especialidad: especialidades.nombre,
      })
      .from(citas)
      .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
      .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
      .where(and(eq(citas.medicoId, medicoId), lt(citas.inicio, finDia), gt(citas.fin, inicioDia)))
      .orderBy(asc(citas.inicio)),
    db.select().from(bloqueosAgenda).where(and(eq(bloqueosAgenda.medicoId, medicoId), lt(bloqueosAgenda.inicio, finDia), gt(bloqueosAgenda.fin, inicioDia))),
    db
      .select({ id: especialidades.id, nombre: especialidades.nombre })
      .from(medicoEspecialidades)
      .innerJoin(especialidades, eq(especialidades.id, medicoEspecialidades.especialidadId))
      .where(eq(medicoEspecialidades.medicoId, medicoId)),
  ]);

  // Todos los cupos del día según el horario (sin descontar nada), para pintar la grilla.
  const cupos = generarCupos({ horarios, ocupados: [], bloqueos: [], desde: fecha, hasta: fecha, desdeInstante: new Date(0) });
  const activas = delDia.filter((c) => c.estado !== "cancelada" && c.estado !== "no_asistio" && !c.sobrecupo);
  const cruza = (a: { inicio: Date; fin: Date }, b: { inicio: Date; fin: Date }) => a.inicio < b.fin && b.inicio < a.fin;

  const pagos = await pagosDeCitas(db, delDia.map((c) => c.id));
  const filas = [
    ...cupos
      .filter((cupo) => !activas.some((c) => cruza(cupo, c)))
      .map((cupo) => {
        const bloqueo = bloqueos.find((b) => cruza(cupo, b));
        return { tipo: bloqueo ? ("bloqueado" as const) : ("libre" as const), inicio: cupo.inicio.toISOString(), motivo: bloqueo?.motivo ?? null };
      }),
    ...delDia.map((c) => ({
      tipo: "cita" as const,
      inicio: c.inicio.toISOString(),
      cita: {
        ...c,
        inicio: c.inicio.toISOString(),
        rut: formatearRut(c.paciente.rut),
        telefono: c.paciente.telefono ? formatearTelefono(c.paciente.telefono) : null,
        pasada: c.inicio < new Date(),
        pago: (() => {
          const p = pagos.get(c.id);
          return p ? { estado: p.estado, medio: TEXTO_MEDIO[p.medio], devolucionPendiente: !!p.detalle?.reembolsoPendiente } : null;
        })(),
      },
    })),
  ].sort((a, b) => a.inicio.localeCompare(b.inicio) || (a.tipo === "cita" ? 1 : -1));

  return {
    fecha,
    hoy,
    medicoId,
    medicos: listaMedicos.map((m) => ({ id: m.id, nombre: `${m.nombres} ${m.apellidos}` })),
    especialidades: espMedico,
    filas,
  };
}

const esquemaAgendar = z.object({
  rut: z.string().refine(validarRut, "RUT inválido").transform((v) => normalizarRut(v)!),
  nombres: z.string().trim().optional(),
  apellidos: z.string().trim().optional(),
  email: z.union([z.email("Correo inválido"), z.literal("")]).optional().transform((v) => v?.toLowerCase() || null),
  telefono: z
    .string()
    .optional()
    .refine((v) => !v || !!normalizarTelefono(v), "Teléfono inválido")
    .transform((v) => (v ? normalizarTelefono(v) : null)),
  prevision: z.union([z.enum(["fonasa", "isapre", "particular"]), z.literal("")]).optional().transform((v) => v || null),
  especialidadId: z.uuid("Elige la especialidad"),
  motivo: z.string().trim().optional().transform((v) => v || null),
  inicio: z.iso.datetime().optional(),
  hora: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sobrecupo: z.literal("1").optional(),
});

const esquemaCobro = z.object({
  citaId: z.uuid(),
  medio: z.enum(["efectivo", "tarjeta", "transferencia", "bono_fonasa", "bono_isapre", "convenio"]),
  monto: z.coerce.number("Ingresa el monto").int().min(0, "Monto inválido"),
  folio: z.string().trim().optional().transform((v) => v || null),
});

export async function action({ request, context }: Route.ActionArgs) {
  const app = context.get(contextoApp);
  const { db } = app;
  const usuario = context.get(contextoUsuario);
  const url = new URL(request.url);
  const formulario = await request.formData();
  const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formulario.get("fecha")).data ?? fechaLocal(new Date());
  const intencion = formulario.get("intent");

  if (intencion === "estado") {
    const citaId = z.uuid().safeParse(formulario.get("citaId")).data;
    const estado = z.enum(["confirmada", "no_asistio", "cancelada"]).safeParse(formulario.get("estado")).data;
    if (!citaId || !estado) return data<ResultadoAccion>({ seccion: "general", error: "Acción no válida" }, { status: 400 });
    const [cita] = await db.select().from(citas).where(eq(citas.id, citaId));
    if (!cita) return data<ResultadoAccion>({ seccion: "general", error: "La cita no existe" }, { status: 404 });

    if (estado === "cancelada") {
      // Si anula la clínica, siempre se devuelve lo pagado con Webpay.
      const r = await anularConDevolucion(app, citaId, "Anulada por recepción", { porLaClinica: true });
      if ("error" in r) return data<ResultadoAccion>({ seccion: citaId, error: r.error }, { status: 409 });
      enSegundoPlano(app, procesarCola(db, app.env));
      if (r.devolucion === "pendiente") {
        return data<ResultadoAccion>({ seccion: citaId, error: "Anulada, pero la devolución de Webpay falló: hay que hacerla manualmente." });
      }
    } else {
      const permitido =
        (estado === "confirmada" && cita.estado === "agendada") ||
        (estado === "no_asistio" && ["agendada", "confirmada"].includes(cita.estado) && cita.inicio < new Date());
      if (!permitido) return data<ResultadoAccion>({ seccion: citaId, error: "No se puede cambiar a ese estado" }, { status: 409 });
      await db.update(citas).set({ estado }).where(eq(citas.id, citaId));
    }
    await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: `cita_${estado}`, entidad: "cita", entidadId: citaId });
    return data<ResultadoAccion>({ seccion: citaId, ok: "Cita actualizada" });
  }

  if (intencion === "agendar") {
    const medicoId = z.uuid().safeParse(formulario.get("medicoId")).data;
    const r = validar(esquemaAgendar, formulario);
    const seccion = String(formulario.get("seccion") ?? "agendar");
    if (!medicoId) return data<ResultadoAccion>({ seccion, error: "Médico no válido" }, { status: 400 });
    if (!r.ok) return data<ResultadoAccion>({ seccion, errores: r.errores }, { status: 400 });
    const d = r.datos;

    const sobrecupo = d.sobrecupo === "1";
    const inicio = sobrecupo ? (d.hora ? aInstante(fecha, d.hora) : null) : d.inicio ? new Date(d.inicio) : null;
    if (!inicio) return data<ResultadoAccion>({ seccion, errores: { hora: "Indica la hora" } }, { status: 400 });

    const [existente] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.rut, d.rut));
    if (!existente && (!d.nombres || d.nombres.length < 2 || !d.apellidos || d.apellidos.length < 2)) {
      return data<ResultadoAccion>({ seccion, errores: { nombres: "Paciente nuevo: ingresa nombres y apellidos" } }, { status: 400 });
    }
    const { paciente } = await obtenerOCrearPaciente(db, {
      rut: d.rut,
      nombres: d.nombres ?? "",
      apellidos: d.apellidos ?? "",
      email: d.email,
      telefono: d.telefono,
      prevision: d.prevision,
    });

    const resultado = await crearCita(db, {
      pacienteId: paciente.id,
      medicoId,
      especialidadId: d.especialidadId,
      inicio,
      canal: "recepcion",
      motivoConsulta: d.motivo,
      sobrecupo,
      desdeInstante: aInstante(fecha, "00:00"),
    });
    if ("error" in resultado) return data<ResultadoAccion>({ seccion, error: resultado.error }, { status: 409 });
    await asegurarCuentaPaciente(db, paciente);
    await registrarAuditoria(db, request, {
      usuarioId: usuario.id,
      accion: sobrecupo ? "agendar_sobrecupo" : "agendar",
      entidad: "cita",
      entidadId: resultado.citaId,
    });
    enSegundoPlano(app, procesarCola(db, app.env));
    return data<ResultadoAccion>({ seccion: "general", ok: `Hora agendada para ${paciente.nombres} ${paciente.apellidos}` });
  }

  if (intencion === "recordar") {
    const citaId = z.uuid().safeParse(formulario.get("citaId")).data;
    const [cita] = citaId ? await db.select().from(citas).where(eq(citas.id, citaId)) : [];
    if (!cita || !["agendada", "confirmada"].includes(cita.estado) || cita.inicio <= new Date()) {
      return data<ResultadoAccion>({ seccion: citaId ?? "general", error: "Solo se recuerdan citas futuras vigentes" }, { status: 409 });
    }
    await programarAvisosCita(db, cita.id, "recordatorio_ahora");
    enSegundoPlano(app, procesarCola(db, app.env));
    return data<ResultadoAccion>({ seccion: cita.id, ok: "Recordatorio enviado" });
  }

  if (intencion === "cobrar") {
    const r = validar(esquemaCobro, formulario);
    const citaId = String(formulario.get("citaId") ?? "");
    const seccion = `cobro-${citaId}`;
    if (!r.ok) return data<ResultadoAccion>({ seccion, errores: r.errores }, { status: 400 });
    if ((r.datos.medio === "bono_fonasa" || r.datos.medio === "bono_isapre") && !r.datos.folio) {
      return data<ResultadoAccion>({ seccion, errores: { folio: "Ingresa el folio del bono" } }, { status: 400 });
    }
    const resultado = await registrarPagoCaja(db, { ...r.datos, usuarioId: usuario.id });
    if ("error" in resultado) return data<ResultadoAccion>({ seccion, error: resultado.error }, { status: 409 });
    await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: "registrar_pago", entidad: "cita", entidadId: r.datos.citaId, detalle: { medio: r.datos.medio, monto: r.datos.monto } });
    return data<ResultadoAccion>({ seccion: r.datos.citaId, ok: "Pago registrado" });
  }

  return data<ResultadoAccion>({ seccion: "general", error: "Acción no válida" }, { status: 400 });
}

type Paciente = { encontrado: boolean; nombre?: string; prevision?: string | null };

/** Formulario de agendamiento de recepción: busca el RUT y pide datos solo si es paciente nuevo. */
function FormularioAgendar({
  fecha,
  medicoId,
  especialidades,
  inicio,
  sobrecupo,
  resultado,
  seccion,
}: {
  fecha: string;
  medicoId: string;
  especialidades: { id: string; nombre: string }[];
  inicio?: string;
  sobrecupo?: boolean;
  resultado?: ResultadoAccion;
  seccion: string;
}) {
  const buscador = useFetcher<Paciente>();
  const [rut, setRut] = useState("");
  const errores = resultado?.seccion === seccion ? (resultado.errores ?? {}) : {};
  const paciente = buscador.data;

  useEffect(() => {
    if (validarRut(rut)) buscador.load(`/admin/pacientes/buscar?rut=${encodeURIComponent(rut)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rut]);

  return (
    <Form method="post" className="space-y-3">
      <input type="hidden" name="intent" value="agendar" />
      <input type="hidden" name="seccion" value={seccion} />
      <input type="hidden" name="medicoId" value={medicoId} />
      <input type="hidden" name="fecha" value={fecha} />
      {inicio && <input type="hidden" name="inicio" value={inicio} />}
      {sobrecupo && <input type="hidden" name="sobrecupo" value="1" />}
      <div className="grid gap-3 sm:grid-cols-3">
        {sobrecupo && <Campo etiqueta="Hora" name="hora" type="time" error={errores.hora} required />}
        <Campo etiqueta="RUT del paciente" name="rut" value={rut} onChange={(e) => setRut(e.target.value)} error={errores.rut} required />
        <CampoSelect etiqueta="Especialidad" name="especialidadId" error={errores.especialidadId}>
          {especialidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </CampoSelect>
      </div>
      {paciente?.encontrado ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Paciente registrado: <strong>{paciente.nombre}</strong>
          {paciente.prevision && <span className="capitalize"> · {paciente.prevision}</span>}
        </p>
      ) : (
        validarRut(rut) &&
        paciente && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Nombres" name="nombres" error={errores.nombres} required />
            <Campo etiqueta="Apellidos" name="apellidos" required />
            <CampoSelect etiqueta="Previsión" name="prevision">
              <option value="">—</option>
              <option value="fonasa">Fonasa</option>
              <option value="isapre">Isapre</option>
              <option value="particular">Particular</option>
            </CampoSelect>
            <Campo etiqueta="Correo" name="email" type="email" error={errores.email} />
            <Campo etiqueta="Celular" name="telefono" type="tel" error={errores.telefono} />
          </div>
        )
      )}
      <Campo etiqueta="Motivo" name="motivo" ayuda="Opcional" />
      {resultado?.seccion === seccion && resultado.error && <Aviso tipo="error">{resultado.error}</Aviso>}
      <button className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700">
        {sobrecupo ? "Agendar sobrecupo" : "Agendar"}
      </button>
    </Form>
  );
}

export default function Agenda({ loaderData, actionData }: Route.ComponentProps) {
  const d = loaderData;
  const r = actionData as ResultadoAccion | undefined;
  const [params] = useSearchParams();
  const conFecha = (fecha: string) => {
    const p = new URLSearchParams(params);
    p.set("fecha", fecha);
    return `?${p}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>
          <p className="mt-1 text-slate-500">{formatearDia(d.fecha)}</p>
        </div>
        <Form method="get" className="flex flex-wrap items-end gap-2">
          <select name="medico" defaultValue={d.medicoId} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Médico">
            {d.medicos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <input type="date" name="fecha" defaultValue={d.fecha} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Fecha" />
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">Ver</button>
        </Form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <Link to={conFecha(sumarDias(d.fecha, -1))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">← Día anterior</Link>
        {d.fecha !== d.hoy && <Link to={conFecha(d.hoy)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Hoy</Link>}
        <Link to={conFecha(sumarDias(d.fecha, 1))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Día siguiente →</Link>
      </div>

      {r?.seccion === "general" && (r.ok || r.error) && (
        <div className="mt-4"><Aviso tipo={r.ok ? "ok" : "error"}>{r.ok ?? r.error}</Aviso></div>
      )}

      <details className="mt-6 rounded-xl border border-slate-200 bg-white" open={r?.seccion === "sobrecupo" && !r.ok}>
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-marca-700">+ Agendar sobrecupo</summary>
        <div className="border-t border-slate-100 p-5">
          <p className="mb-3 text-sm text-slate-500">Hora adicional fuera de los cupos normales del médico.</p>
          <FormularioAgendar key={`sc-${d.medicoId}-${d.fecha}`} fecha={d.fecha} medicoId={d.medicoId} especialidades={d.especialidades} sobrecupo resultado={r} seccion="sobrecupo" />
        </div>
      </details>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {d.filas.length === 0 && <p className="px-5 py-10 text-center text-slate-400">El médico no atiende este día.</p>}
        <ul className="divide-y divide-slate-100">
          {d.filas.map((f) => {
            const hora = formatearHora(new Date(f.inicio));
            if (f.tipo === "bloqueado") {
              return (
                <li key={`b-${f.inicio}`} className="flex items-center gap-5 bg-slate-50 px-5 py-3 text-sm text-slate-400">
                  <span className="w-14 font-medium">{hora}</span>Bloqueado{f.motivo ? ` · ${f.motivo}` : ""}
                </li>
              );
            }
            if (f.tipo === "libre") {
              const seccion = `libre-${f.inicio}`;
              return (
                <li key={seccion} className="px-5 py-3 text-sm">
                  <details open={r?.seccion === seccion && !r.ok}>
                    <summary className="flex cursor-pointer list-none items-center gap-5">
                      <span className="w-14 font-medium text-slate-900">{hora}</span>
                      <span className="text-emerald-700">Libre</span>
                      <span className="ml-auto text-marca-700">Agendar</span>
                    </summary>
                    <div className="mt-3 rounded-lg bg-slate-50 p-4">
                      <FormularioAgendar fecha={d.fecha} medicoId={d.medicoId} especialidades={d.especialidades} inicio={f.inicio} resultado={r} seccion={seccion} />
                    </div>
                  </details>
                </li>
              );
            }
            if (f.tipo !== "cita") return null;
            const c = f.cita;
            const inactiva = c.estado === "cancelada" || c.estado === "no_asistio";
            return (
              <li key={c.id} className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-sm ${inactiva ? "opacity-60" : ""}`}>
                <span className="w-14 font-medium text-slate-900">{hora}</span>
                <div className="min-w-48 flex-1">
                  <p className="font-medium text-slate-900">
                    {c.paciente.nombres} {c.paciente.apellidos}
                    {c.sobrecupo && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-normal text-violet-800">Sobrecupo</span>}
                    {c.requiereRevision && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">Revisar datos</span>}
                  </p>
                  <p className="text-slate-500">
                    {c.rut}{c.telefono && ` · ${c.telefono}`} · {c.especialidad}{c.motivo && ` · ${c.motivo}`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs ${estiloEstadoCita[c.estado]}`}>{textoEstadoCita[c.estado]}</span>
                <EstadoPago cita={c} resultado={r} />
                {!inactiva && c.estado !== "atendida" && (
                  <div className="flex gap-2">
                    {c.estado === "agendada" && <BotonEstado citaId={c.id} estado="confirmada" texto="Confirmar" />}
                    {c.pasada && <BotonEstado citaId={c.id} estado="no_asistio" texto="No asistió" />}
                    {!c.pasada && c.estado !== "pendiente_pago" && <BotonAccion citaId={c.id} intent="recordar" texto="Recordar" />}
                    {!c.pasada && <BotonEstado citaId={c.id} estado="cancelada" texto="Anular" peligro />}
                  </div>
                )}
                {r && r.seccion === c.id && (r.ok || r.error) && (
                  <span className={`text-xs ${r.ok ? "text-emerald-700" : "text-rose-600"}`}>{r.ok ?? r.error}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

type FilaCita = Extract<Route.ComponentProps["loaderData"]["filas"][number], { tipo: "cita" }>["cita"];

/** Pagado / devuelto, o el botón para cobrar en caja. */
function EstadoPago({ cita, resultado }: { cita: FilaCita; resultado?: ResultadoAccion }) {
  const { pago } = cita;
  if (pago?.estado === "pagado") {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">
        Pagado · {pago.medio}
        {pago.devolucionPendiente && " · devolución pendiente"}
      </span>
    );
  }
  if (pago?.estado === "reembolsado") return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Pago devuelto</span>;
  if (cita.estado === "cancelada" || cita.estado === "pendiente_pago") return null;

  const seccion = `cobro-${cita.id}`;
  const errores = resultado?.seccion === seccion ? (resultado.errores ?? {}) : {};
  return (
    <details className="relative" open={resultado?.seccion === seccion}>
      <summary className="cursor-pointer list-none rounded-md border border-marca-100 bg-marca-50 px-2.5 py-1 text-xs text-marca-700">Cobrar</summary>
      <Form method="post" className="absolute right-0 z-10 mt-2 w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <input type="hidden" name="intent" value="cobrar" />
        <input type="hidden" name="citaId" value={cita.id} />
        <CampoSelect etiqueta="Medio de pago" name="medio">
          <option value="bono_fonasa">Bono Fonasa</option>
          <option value="bono_isapre">Bono Isapre</option>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="convenio">Convenio</option>
        </CampoSelect>
        <Campo etiqueta="Monto (CLP)" name="monto" type="number" defaultValue={cita.precio} error={errores.monto} />
        <Campo etiqueta="Folio del bono" name="folio" ayuda="Obligatorio para bonos" error={errores.folio} />
        {resultado?.seccion === seccion && resultado.error && <Aviso tipo="error">{resultado.error}</Aviso>}
        <button className="w-full rounded-lg bg-marca-600 px-3 py-2 text-sm font-medium text-white hover:bg-marca-700">Registrar pago</button>
      </Form>
    </details>
  );
}

function BotonAccion({ citaId, intent, texto }: { citaId: string; intent: string; texto: string }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="citaId" value={citaId} />
      <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">{texto}</button>
    </Form>
  );
}

function BotonEstado({ citaId, estado, texto, peligro }: { citaId: string; estado: string; texto: string; peligro?: boolean }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="estado" />
      <input type="hidden" name="citaId" value={citaId} />
      <input type="hidden" name="estado" value={estado} />
      <button className={`rounded-md border px-2.5 py-1 text-xs ${peligro ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
        {texto}
      </button>
    </Form>
  );
}
