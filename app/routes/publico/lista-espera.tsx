import { and, asc, eq, isNull } from "drizzle-orm";
import { data, Form, Link, useNavigation } from "react-router";
import { z } from "zod";
import { Aviso, Campo, CampoSelect } from "~/components/formulario";
import { canalesAviso, clinica } from "~/config/clinica";
import { especialidades, listaEspera, medicos } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { fechaLocal, sumarDias } from "~/lib/fechas";
import { validar } from "~/lib/formularios";
import { normalizarRut, validarRut } from "~/lib/rut";
import { normalizarTelefono } from "~/lib/telefono";
import { asegurarCuentaPaciente, obtenerOCrearPaciente } from "~/modules/pacientes.server";
import type { Route } from "./+types/lista-espera";

export function meta() {
  return [{ title: `Lista de espera · ${clinica.nombre}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const url = new URL(request.url);
  const medicoId = z.uuid().safeParse(url.searchParams.get("medico")).data;
  const [lista, medico] = await Promise.all([
    db.select({ id: especialidades.id, nombre: especialidades.nombre }).from(especialidades).where(eq(especialidades.activa, true)).orderBy(asc(especialidades.nombre)),
    medicoId ? db.select().from(medicos).where(eq(medicos.id, medicoId)).then((r) => r[0]) : undefined,
  ]);
  const hoy = fechaLocal(new Date());
  return {
    especialidades: lista,
    especialidadId: z.uuid().safeParse(url.searchParams.get("especialidad")).data ?? "",
    medico: medico ? { id: medico.id, nombre: `${medico.nombres} ${medico.apellidos}` } : null,
    desde: hoy,
    hasta: sumarDias(hoy, clinica.reglas.diasAgendaVisible),
  };
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const esquema = z
  .object({
    especialidadId: z.uuid("Elige una especialidad"),
    medicoId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
    rut: z.string().refine(validarRut, "RUT inválido").transform((v) => normalizarRut(v)!),
    nombres: z.string().trim().min(2, "Ingresa tus nombres"),
    apellidos: z.string().trim().min(2, "Ingresa tus apellidos"),
    email: z.email("Ingresa un correo válido").transform((v) => v.toLowerCase()),
    telefono: z.string().refine((v) => !!normalizarTelefono(v), "Teléfono inválido").transform((v) => normalizarTelefono(v)!),
    prevision: z.enum(["fonasa", "isapre", "particular"], "Elige la previsión"),
    desde: fecha,
    hasta: fecha,
    consentimiento: z.literal("on", "Debes aceptar para que podamos avisarte"),
  })
  .refine((d) => d.hasta >= d.desde, { message: "Debe ser posterior a la fecha inicial", path: ["hasta"] });

export async function action({ request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const r = validar(esquema, await request.formData());
  if (!r.ok) return data({ errores: r.errores, ok: false }, { status: 400 });
  const d = r.datos;

  const { paciente } = await obtenerOCrearPaciente(
    db,
    { rut: d.rut, nombres: d.nombres, apellidos: d.apellidos, email: d.email, telefono: d.telefono, prevision: d.prevision },
    { consentimiento: true },
  );
  await asegurarCuentaPaciente(db, paciente);

  // Si ya estaba inscrito para lo mismo, se actualiza el rango en vez de duplicar.
  const [existente] = await db
    .select({ id: listaEspera.id })
    .from(listaEspera)
    .where(
      and(
        eq(listaEspera.pacienteId, paciente.id),
        eq(listaEspera.especialidadId, d.especialidadId),
        d.medicoId ? eq(listaEspera.medicoId, d.medicoId) : isNull(listaEspera.medicoId),
        eq(listaEspera.estado, "activa"),
      ),
    );
  if (existente) {
    await db.update(listaEspera).set({ desde: d.desde, hasta: d.hasta }).where(eq(listaEspera.id, existente.id));
  } else {
    await db.insert(listaEspera).values({ pacienteId: paciente.id, especialidadId: d.especialidadId, medicoId: d.medicoId, desde: d.desde, hasta: d.hasta });
  }
  return data({ errores: {} as Record<string, string>, ok: true });
}

export default function ListaEspera({ loaderData, actionData }: Route.ComponentProps) {
  const d = loaderData;
  const errores = actionData?.errores ?? {};
  const enviando = useNavigation().state === "submitting";

  if (actionData?.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Quedaste en la lista de espera</h1>
        <p className="mt-3 text-slate-600">Si se libera una hora en las fechas que indicaste, te avisaremos por {canalesAviso()}.</p>
        <Link to="/" className="mt-6 inline-block text-marca-700 underline">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Lista de espera</h1>
      <p className="mt-2 text-slate-600">
        Déjanos tus datos y te avisaremos apenas se libere una hora{d.medico ? ` con ${d.medico.nombre}` : ""}.
      </p>
      <Form method="post" className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        {d.medico && <input type="hidden" name="medicoId" value={d.medico.id} />}
        <CampoSelect etiqueta="Especialidad" name="especialidadId" defaultValue={d.especialidadId} error={errores.especialidadId} required>
          <option value="">Elige</option>
          {d.especialidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </CampoSelect>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Me sirve desde" name="desde" type="date" defaultValue={d.desde} min={d.desde} error={errores.desde} required />
          <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={d.hasta} min={d.desde} error={errores.hasta} required />
        </div>
        <Campo etiqueta="RUT" name="rut" placeholder="12.345.678-5" error={errores.rut} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombres" name="nombres" error={errores.nombres} required />
          <Campo etiqueta="Apellidos" name="apellidos" error={errores.apellidos} required />
          <Campo etiqueta="Correo" name="email" type="email" error={errores.email} required />
          <Campo etiqueta="Celular" name="telefono" type="tel" placeholder="9 1234 5678" error={errores.telefono} required />
          <CampoSelect etiqueta="Previsión" name="prevision" error={errores.prevision} required>
            <option value="">Elige</option>
            <option value="fonasa">Fonasa</option>
            <option value="isapre">Isapre</option>
            <option value="particular">Particular</option>
          </CampoSelect>
        </div>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="consentimiento" className="mt-0.5 h-4 w-4 accent-marca-600" required />
          <span>Acepto que me contacten por {canalesAviso()} para ofrecerme una hora.</span>
        </label>
        {errores.consentimiento && <Aviso tipo="error">{errores.consentimiento}</Aviso>}
        <button disabled={enviando} className="w-full rounded-lg bg-marca-600 px-5 py-3 font-medium text-white hover:bg-marca-700 disabled:opacity-60">
          Inscribirme
        </button>
      </Form>
    </div>
  );
}
