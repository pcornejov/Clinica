import { eq } from "drizzle-orm";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { Aviso, Campo, CampoSelect, CampoTexto } from "~/components/formulario";
import { canalesAviso, clinica } from "~/config/clinica";
import { especialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp, enSegundoPlano } from "~/lib/contexto";
import { fechaLocal, formatearFechaHora, formatearPesos } from "~/lib/fechas";
import { validar, type Errores } from "~/lib/formularios";
import { formatearRut, normalizarRut, validarRut } from "~/lib/rut";
import { obtenerUsuario } from "~/lib/sesion.server";
import { normalizarTelefono } from "~/lib/telefono";
import { crearTokenGestion } from "~/lib/token-gestion.server";
import { procesarCola } from "~/modules/avisos/cola.server";
import { anularCita, buscarCupos, crearCita } from "~/modules/citas.server";
import { iniciarPagoWebpay } from "~/modules/pagos.server";
import { asegurarCuentaPaciente, obtenerOCrearPaciente } from "~/modules/pacientes.server";
import type { Route } from "./+types/agendar-confirmar";

export function meta() {
  return [{ title: `Confirma tu hora · ${clinica.nombre}` }];
}

const esquemaUrl = z.object({
  especialidad: z.uuid(),
  medico: z.uuid(),
  inicio: z.iso.datetime(),
});

async function cargarHora(db: Parameters<typeof buscarCupos>[0], url: URL) {
  const r = esquemaUrl.safeParse(Object.fromEntries(url.searchParams));
  if (!r.success) throw new Response("Hora no válida", { status: 400 });
  const inicio = new Date(r.data.inicio);
  const [[medico], [especialidad]] = await Promise.all([
    db.select().from(medicos).where(eq(medicos.id, r.data.medico)),
    db.select().from(especialidades).where(eq(especialidades.id, r.data.especialidad)),
  ]);
  if (!medico || !especialidad) throw new Response("Hora no válida", { status: 404 });
  const fecha = fechaLocal(inicio);
  const { cupos } = await buscarCupos(db, { especialidadId: especialidad.id, medicoId: medico.id, desde: fecha, hasta: fecha });
  const disponible = cupos.some((c) => c.inicio.getTime() === inicio.getTime());
  return { medico, especialidad, inicio, disponible };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const url = new URL(request.url);
  const { medico, especialidad, inicio, disponible } = await cargarHora(db, url);

  // Si el paciente ya inició sesión, se completan sus datos.
  const usuario = await obtenerUsuario(request, context);
  let prellenado: { rut: string; nombres: string; apellidos: string; email: string; telefono: string; prevision: string } | null = null;
  if (usuario?.role === "paciente") {
    const [p] = await db.select().from(pacientes).where(eq(pacientes.userId, usuario.id));
    if (p) {
      prellenado = {
        rut: formatearRut(p.rut),
        nombres: p.nombres,
        apellidos: p.apellidos,
        email: p.email ?? "",
        telefono: p.telefono ?? "",
        prevision: p.prevision ?? "",
      };
    }
  }

  return {
    hora: {
      medico: `${medico.nombres} ${medico.apellidos}`,
      especialidad: especialidad.nombre,
      precio: especialidad.precio,
      inicio: inicio.toISOString(),
      disponible,
    },
    volver: `/agendar?especialidad=${especialidad.id}`,
    prellenado,
    pagoOnline: clinica.modulos.pagoOnline,
    minutosParaPagar: clinica.reglas.reservaPagoMinutos,
  };
}

const rut = (mensaje: string) => z.string().refine(validarRut, mensaje).transform((v) => normalizarRut(v)!);
const nombre = (mensaje: string) => z.string().trim().min(2, mensaje);
const telefono = z.string().transform((v, ctx) => {
  const normalizado = normalizarTelefono(v);
  if (!normalizado) {
    ctx.addIssue({ code: "custom", message: "Teléfono inválido (ej. 9 1234 5678)" });
    return z.NEVER;
  }
  return normalizado;
});
const previsionCampo = z.enum(["fonasa", "isapre", "particular"], "Elige la previsión");
const fechaNacimiento = z
  .string()
  .optional()
  .transform((v) => v || null)
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida");

const esquemaComun = {
  rut: rut("RUT inválido"),
  nombres: nombre("Ingresa los nombres"),
  apellidos: nombre("Ingresa los apellidos"),
  prevision: previsionCampo,
  fechaNacimiento,
  motivo: z.string().trim().max(300).optional().transform((v) => v || null),
  consentimiento: z.literal("on", "Debes aceptar para recibir la confirmación y recordatorios"),
  pago: z.enum(["clinica", "webpay"]).default("clinica"),
};

const esquema = z.discriminatedUnion("para", [
  z.object({
    para: z.literal("mi"),
    ...esquemaComun,
    email: z.email("Ingresa un correo válido").transform((v) => v.toLowerCase()),
    telefono,
  }),
  z.object({
    para: z.literal("otro"),
    ...esquemaComun,
    tutorRut: rut("RUT inválido"),
    tutorNombres: nombre("Ingresa tus nombres"),
    tutorApellidos: nombre("Ingresa tus apellidos"),
    tutorEmail: z.email("Ingresa un correo válido").transform((v) => v.toLowerCase()),
    tutorTelefono: telefono,
  }),
]);

export async function action({ request, context }: Route.ActionArgs) {
  const app = context.get(contextoApp);
  const { db, env } = app;
  const url = new URL(request.url);
  const { medico, especialidad, inicio } = await cargarHora(db, url);

  const r = validar(esquema, await request.formData());
  if (!r.ok) return data({ errores: r.errores, error: null as string | null }, { status: 400 });
  const d = r.datos;

  let pacienteId: string;
  let requiereRevision: boolean;
  let titular;
  if (d.para === "mi") {
    const res = await obtenerOCrearPaciente(
      db,
      { rut: d.rut, nombres: d.nombres, apellidos: d.apellidos, email: d.email, telefono: d.telefono, prevision: d.prevision, fechaNacimiento: d.fechaNacimiento },
      { consentimiento: true },
    );
    pacienteId = res.paciente.id;
    requiereRevision = res.requiereRevision;
    titular = res.paciente;
  } else {
    if (d.tutorRut === d.rut) {
      return data({ errores: { tutorRut: "Debe ser distinto al RUT del paciente" } as Errores, error: null }, { status: 400 });
    }
    const tutor = await obtenerOCrearPaciente(
      db,
      { rut: d.tutorRut, nombres: d.tutorNombres, apellidos: d.tutorApellidos, email: d.tutorEmail, telefono: d.tutorTelefono },
      { consentimiento: true },
    );
    const dependiente = await obtenerOCrearPaciente(
      db,
      { rut: d.rut, nombres: d.nombres, apellidos: d.apellidos, prevision: d.prevision, fechaNacimiento: d.fechaNacimiento },
      { tutorId: tutor.paciente.id },
    );
    pacienteId = dependiente.paciente.id;
    requiereRevision = tutor.requiereRevision || dependiente.requiereRevision;
    titular = tutor.paciente;
  }

  const resultado = await crearCita(db, {
    pacienteId,
    medicoId: medico.id,
    especialidadId: especialidad.id,
    inicio,
    canal: "web",
    motivoConsulta: d.motivo,
    requiereRevision,
    pagoOnline: d.pago === "webpay",
  });
  if ("error" in resultado) return data({ errores: {} as Errores, error: resultado.error }, { status: 409 });
  await asegurarCuentaPaciente(db, titular);

  if (d.pago === "webpay") {
    const pago = await iniciarPagoWebpay({ db, env }, resultado.citaId, url.origin);
    if ("error" in pago) {
      await anularCita(db, resultado.citaId, "No se pudo iniciar el pago");
      return data({ errores: {} as Errores, error: pago.error }, { status: 502 });
    }
    return redirect(`/pago/webpay/ir?${new URLSearchParams({ token: pago.token })}`);
  }

  // La confirmación sale de inmediato, sin hacer esperar al paciente.
  enSegundoPlano(app, procesarCola(db, env));
  const token = await crearTokenGestion(resultado.citaId, env.BETTER_AUTH_SECRET);
  return redirect(`/cita/${token}?nueva=1`);
}

export default function Confirmar({ loaderData, actionData }: Route.ComponentProps) {
  const { hora, volver, prellenado, pagoOnline, minutosParaPagar } = loaderData;
  const errores = actionData?.errores ?? {};
  const [para, setPara] = useState<"mi" | "otro">("mi");
  const [pago, setPago] = useState<"clinica" | "webpay">("clinica");
  const enviando = useNavigation().state === "submitting";

  if (!hora.disponible && !actionData) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Esta hora ya no está disponible</h1>
        <p className="mt-3 text-slate-600">Alguien la tomó o ya pasó el plazo para reservarla.</p>
        <Link to={volver} className="mt-6 inline-block rounded-lg bg-marca-600 px-5 py-2.5 font-medium text-white">Elegir otra hora</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to={volver} className="text-sm text-marca-700 hover:underline">← Elegir otra hora</Link>
      <h1 className="mt-2 text-3xl font-semibold text-slate-900">Confirma tu hora</h1>

      <div className="mt-6 rounded-2xl border border-marca-100 bg-marca-50 p-5">
        <p className="text-lg font-semibold text-slate-900">{formatearFechaHora(new Date(hora.inicio))}</p>
        <p className="mt-1 text-slate-700">{hora.especialidad} · {hora.medico}</p>
        <p className="mt-1 text-sm text-slate-600">Valor de la consulta: {formatearPesos(hora.precio)}</p>
      </div>

      <Form method="post" className="mt-6 space-y-6">
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-5">
          <legend className="px-1 text-sm font-medium text-slate-700">La hora es para</legend>
          <div className="flex flex-wrap gap-6">
            {([["mi", "Mí"], ["otro", "Un hijo/a u otra persona a mi cargo"]] as const).map(([valor, texto]) => (
              <label key={valor} className="flex items-center gap-2 text-sm">
                <input type="radio" name="para" value={valor} checked={para === valor} onChange={() => setPara(valor)} className="accent-marca-600" />
                {texto}
              </label>
            ))}
          </div>
        </fieldset>

        {/* key: al cambiar "para quién" se rearman los campos con los valores que corresponden. */}
        <section key={para} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Datos del paciente</h2>
          <Campo etiqueta="RUT del paciente" name="rut" placeholder="12.345.678-5" defaultValue={para === "mi" ? prellenado?.rut : ""} error={errores.rut} required autoFocus />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombres" name="nombres" defaultValue={para === "mi" ? prellenado?.nombres : ""} error={errores.nombres} required />
            <Campo etiqueta="Apellidos" name="apellidos" defaultValue={para === "mi" ? prellenado?.apellidos : ""} error={errores.apellidos} required />
            <CampoSelect etiqueta="Previsión" name="prevision" defaultValue={para === "mi" ? prellenado?.prevision : ""} error={errores.prevision} required>
              <option value="">Elige</option>
              <option value="fonasa">Fonasa</option>
              <option value="isapre">Isapre</option>
              <option value="particular">Particular</option>
            </CampoSelect>
            <Campo etiqueta="Fecha de nacimiento" name="fechaNacimiento" type="date" error={errores.fechaNacimiento} ayuda="Opcional" />
          </div>
          {para === "mi" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Correo" name="email" type="email" defaultValue={prellenado?.email} error={errores.email} required />
              <Campo etiqueta="Celular" name="telefono" type="tel" placeholder="9 1234 5678" defaultValue={prellenado?.telefono} error={errores.telefono} required />
            </div>
          )}
        </section>

        {para === "otro" && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Tus datos (responsable)</h2>
            <p className="text-sm text-slate-500">Te enviaremos a ti la confirmación y los recordatorios.</p>
            <Campo etiqueta="Tu RUT" name="tutorRut" defaultValue={prellenado?.rut} error={errores.tutorRut} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombres" name="tutorNombres" defaultValue={prellenado?.nombres} error={errores.tutorNombres} required />
              <Campo etiqueta="Apellidos" name="tutorApellidos" defaultValue={prellenado?.apellidos} error={errores.tutorApellidos} required />
              <Campo etiqueta="Correo" name="tutorEmail" type="email" defaultValue={prellenado?.email} error={errores.tutorEmail} required />
              <Campo etiqueta="Celular" name="tutorTelefono" type="tel" placeholder="9 1234 5678" defaultValue={prellenado?.telefono} error={errores.tutorTelefono} required />
            </div>
          </section>
        )}

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <CampoTexto etiqueta="Motivo de la consulta" name="motivo" rows={2} ayuda="Opcional" />
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" name="consentimiento" className="mt-0.5 h-4 w-4 accent-marca-600" required />
            <span>
              Acepto recibir la confirmación y recordatorios de mi hora por {canalesAviso()}.
              Los mensajes no incluyen información clínica.
            </span>
          </label>
          {errores.consentimiento && <p className="text-xs text-rose-600">{errores.consentimiento}</p>}
        </section>

        <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <legend className="px-1 text-sm font-medium text-slate-700">¿Cómo quieres pagar?</legend>
          {([
            ["clinica", "En la clínica", "El día de tu atención: efectivo, tarjeta o bono Fonasa/Isapre."],
            ...(pagoOnline ? [["webpay", "Ahora con Webpay", "Tarjeta de débito o crédito. Si anulas con más de 24 horas de anticipación, te devolvemos el pago."]] : []),
          ] as [string, string, string][]).map(([valor, titulo, detalle]) => (
            <label key={valor} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${pago === valor ? "border-marca-500 bg-marca-50" : "border-slate-200"}`}>
              <input type="radio" name="pago" value={valor} checked={pago === valor} onChange={() => setPago(valor as "clinica" | "webpay")} className="mt-0.5 accent-marca-600" />
              <span>
                <span className="font-medium text-slate-900">{titulo}</span>
                <span className="block text-slate-500">{detalle}</span>
              </span>
            </label>
          ))}
          {pago === "webpay" && <p className="text-xs text-slate-500">Retenemos la hora por {minutosParaPagar} minutos mientras completas el pago.</p>}
        </fieldset>

        {actionData?.error && <Aviso tipo="error">{actionData.error} <Link to={volver} className="underline">Ver otras horas</Link></Aviso>}

        <button disabled={enviando} className="w-full rounded-lg bg-marca-600 px-5 py-3 font-medium text-white hover:bg-marca-700 disabled:opacity-60">
          {enviando ? "Reservando…" : pago === "webpay" ? `Ir a pagar ${formatearPesos(hora.precio)} con Webpay` : "Confirmar reserva"}
        </button>
      </Form>
    </div>
  );
}
