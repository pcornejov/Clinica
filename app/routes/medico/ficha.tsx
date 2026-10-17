import { eq } from "drizzle-orm";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { Aviso, Boton, Campo, CampoTexto } from "~/components/formulario";
import { adjuntos, fichasClinicas, type SignosVitales } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { fechaLocal, formatearDia, formatearFechaHora } from "~/lib/fechas";
import { formatearRut } from "~/lib/rut";
import { formatearTelefono } from "~/lib/telefono";
import { edad, imc } from "~/modules/clinico";
import { bucketArchivos, nombreSeguro, TAMANO_MAXIMO, tipoReal } from "~/modules/archivos.server";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { historial, listarAdjuntos, medicoDeUsuario, obtenerFicha, pacientePorId, tipoAcceso } from "~/modules/fichas.server";
import type { Route } from "./+types/ficha";

export function meta() {
  return [{ title: "Ficha clínica · Portal médico" }];
}

const ANTECEDENTES = [
  ["alergias", "Alergias"],
  ["enfermedadesCronicas", "Enfermedades crónicas"],
  ["medicamentosHabituales", "Medicamentos habituales"],
  ["antecedentesQuirurgicos", "Antecedentes quirúrgicos"],
  ["antecedentesFamiliares", "Antecedentes familiares"],
  ["habitos", "Hábitos (tabaco, alcohol, actividad física)"],
  ["observaciones", "Observaciones"],
] as const;

async function contextoFicha(params: { id: string }, context: Route.LoaderArgs["context"]) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);
  if (!z.uuid().safeParse(params.id).success) throw new Response("Paciente no encontrado", { status: 404 });
  const paciente = await pacientePorId(db, params.id);
  if (!paciente) throw new Response("Paciente no encontrado", { status: 404 });
  const medico = await medicoDeUsuario(db, usuario.id);
  const acceso = await tipoAcceso(db, medico, usuario.id, paciente.id);
  return { db, usuario, paciente, medico, acceso };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, usuario, paciente, medico, acceso } = await contextoFicha(params, context);
  const datosBasicos = { id: paciente.id, nombre: `${paciente.nombres} ${paciente.apellidos}` };
  if (!acceso) return { sinAcceso: true as const, paciente: datosBasicos };

  // Cada vez que se abre una ficha queda registrado quién la vio.
  await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: "ver_ficha", entidad: "ficha", entidadId: paciente.id, detalle: { acceso } });

  const ficha = await obtenerFicha(db, paciente.id);
  const [atenciones, archivos, tutor] = await Promise.all([
    historial(db, ficha.id),
    listarAdjuntos(db, paciente.id),
    paciente.tutorId ? pacientePorId(db, paciente.tutorId) : Promise.resolve(undefined),
  ]);
  const ultimosSignos = atenciones.find((a) => a.atencion.signosVitales)?.atencion;

  return {
    sinAcceso: false as const,
    acceso,
    medicoId: medico.id,
    paciente: {
      ...datosBasicos,
      rut: formatearRut(paciente.rut),
      edad: edad(paciente.fechaNacimiento),
      fechaNacimiento: paciente.fechaNacimiento,
      sexo: paciente.sexo,
      prevision: paciente.prevision === "isapre" && paciente.isapre ? `Isapre ${paciente.isapre}` : paciente.prevision,
      telefono: paciente.telefono ? formatearTelefono(paciente.telefono) : null,
      email: paciente.email,
      tutor: tutor ? `${tutor.nombres} ${tutor.apellidos}${tutor.telefono ? ` · ${formatearTelefono(tutor.telefono)}` : ""}` : null,
    },
    ficha,
    ultimosSignos: ultimosSignos ? { fecha: ultimosSignos.fecha.toISOString(), ...(ultimosSignos.signosVitales as SignosVitales) } : null,
    atenciones: atenciones.map((a) => ({
      ...a.atencion,
      fecha: a.atencion.fecha.toISOString(),
      medico: `${a.medico.nombres} ${a.medico.apellidos}`,
      especialidad: a.especialidad,
      diagnosticos: a.diagnosticos,
      corregida: a.corregida,
      propia: a.atencion.medicoId === medico.id,
    })),
    adjuntos: archivos.map((x) => ({ id: x.id, nombre: x.nombreArchivo, tipo: x.tipoMime, tamano: x.tamanoBytes, fecha: x.creadoEn.toISOString() })),
    puedeSubir: !!bucketArchivos(context.get(contextoApp).env),
  };
}

const esquemaAntecedentes = z.object({
  grupoSanguineo: z.string().trim().max(5).optional().transform((v) => v || null),
  ...Object.fromEntries(ANTECEDENTES.map(([k]) => [k, z.string().trim().max(2000).optional().transform((v) => v || null)])),
});

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(contextoApp);
  const { db, usuario, paciente, acceso } = await contextoFicha(params, context);
  const formulario = await request.formData();
  const intencion = formulario.get("intent");

  if (intencion === "acceso_excepcional") {
    const motivo = String(formulario.get("motivo") ?? "").trim();
    if (motivo.length < 10) return data({ seccion: "acceso", error: "Describe el motivo (mínimo 10 caracteres)", ok: null }, { status: 400 });
    await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: "acceso_excepcional", entidad: "ficha", entidadId: paciente.id, detalle: { motivo } });
    return redirect(`/medico/pacientes/${paciente.id}`);
  }
  if (!acceso) throw new Response("Sin acceso a esta ficha", { status: 403 });

  if (intencion === "antecedentes") {
    const r = esquemaAntecedentes.safeParse(Object.fromEntries(formulario));
    if (!r.success) return data({ seccion: "antecedentes", error: "Datos inválidos", ok: null }, { status: 400 });
    const ficha = await obtenerFicha(db, paciente.id);
    const cambiados = Object.keys(r.data).filter((k) => (ficha as Record<string, unknown>)[k] !== (r.data as Record<string, unknown>)[k]);
    await db.update(fichasClinicas).set({ ...r.data, actualizadoPor: usuario.id }).where(eq(fichasClinicas.id, ficha.id));
    await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: "editar_antecedentes", entidad: "ficha", entidadId: paciente.id, detalle: { campos: cambiados } });
    return data({ seccion: "antecedentes", ok: "Antecedentes guardados", error: null });
  }

  if (intencion === "subir") {
    const bucket = bucketArchivos(env);
    const archivo = formulario.get("archivo");
    if (!bucket) return data({ seccion: "adjuntos", error: "El almacenamiento de archivos no está configurado", ok: null }, { status: 400 });
    if (!(archivo instanceof File) || archivo.size === 0) return data({ seccion: "adjuntos", error: "Elige un archivo", ok: null }, { status: 400 });
    if (archivo.size > TAMANO_MAXIMO) return data({ seccion: "adjuntos", error: "El archivo supera los 10 MB", ok: null }, { status: 400 });
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const tipo = tipoReal(bytes);
    if (!tipo) return data({ seccion: "adjuntos", error: "Solo se aceptan PDF, PNG o JPG", ok: null }, { status: 400 });

    const clave = `pacientes/${paciente.id}/${crypto.randomUUID()}`;
    await bucket.put(clave, bytes, { httpMetadata: { contentType: tipo } });
    const [nuevo] = await db
      .insert(adjuntos)
      .values({ pacienteId: paciente.id, nombreArchivo: nombreSeguro(archivo.name), claveR2: clave, tipoMime: tipo, tamanoBytes: archivo.size, subidoPor: usuario.id })
      .returning({ id: adjuntos.id });
    await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: "subir_adjunto", entidad: "ficha", entidadId: paciente.id, detalle: { adjuntoId: nuevo.id } });
    return data({ seccion: "adjuntos", ok: "Archivo agregado a la ficha", error: null });
  }
  return data({ seccion: "", error: "Acción no válida", ok: null }, { status: 400 });
}

const TEXTO_SIGNOS: [keyof SignosVitales, string, string][] = [
  ["presionSistolica", "PA sistólica", "mmHg"],
  ["presionDiastolica", "PA diastólica", "mmHg"],
  ["frecuenciaCardiaca", "FC", "lpm"],
  ["frecuenciaRespiratoria", "FR", "rpm"],
  ["temperatura", "T°", "°C"],
  ["saturacion", "Sat O₂", "%"],
  ["pesoKg", "Peso", "kg"],
  ["tallaCm", "Talla", "cm"],
];

function Signos({ s }: { s: SignosVitales }) {
  const presion = s.presionSistolica && s.presionDiastolica ? `${s.presionSistolica}/${s.presionDiastolica} mmHg` : null;
  const valores = [
    presion && ["PA", presion],
    ...TEXTO_SIGNOS.filter(([k]) => !k.startsWith("presion") && s[k] !== undefined).map(([k, t, u]) => [t, `${s[k]} ${u}`]),
    imc(s.pesoKg, s.tallaCm) && ["IMC", String(imc(s.pesoKg, s.tallaCm))],
  ].filter(Boolean) as [string, string][];
  return (
    <div className="flex flex-wrap gap-2">
      {valores.map(([t, v]) => (
        <span key={t} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"><span className="text-slate-500">{t}</span> {v}</span>
      ))}
    </div>
  );
}

export default function Ficha({ loaderData, actionData }: Route.ComponentProps) {
  const d = loaderData;
  const enviando = useNavigation().state === "submitting";

  if (d.sinAcceso) {
    return (
      <div className="mx-auto max-w-xl">
        <Link to="/medico/pacientes" className="text-sm text-marca-700 hover:underline">← Pacientes</Link>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900">Acceso excepcional a la ficha</h1>
          <p className="mt-2 text-sm text-slate-600">
            {d.paciente.nombre} no tiene citas contigo. La ficha clínica es confidencial (Ley 20.584): para abrirla,
            declara el motivo. Quedará registrado y la administración podrá revisarlo.
          </p>
          <Form method="post" className="mt-4 space-y-3">
            <input type="hidden" name="intent" value="acceso_excepcional" />
            <CampoTexto etiqueta="Motivo" name="motivo" rows={2} placeholder="Ej: interconsulta solicitada por Dr. Muñoz" required minLength={10} />
            {actionData?.error && <Aviso tipo="error">{actionData.error}</Aviso>}
            <Boton>Abrir ficha</Boton>
          </Form>
        </div>
      </div>
    );
  }

  const { paciente: p, ficha } = d;
  const r = actionData;
  const alergias = ficha.alergias && !/^no refiere$/i.test(ficha.alergias.trim()) ? ficha.alergias : null;

  return (
    <>
      <Link to="/medico/pacientes" className="text-sm text-marca-700 hover:underline">← Pacientes</Link>
      {d.acceso === "excepcional" && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Estás viendo esta ficha con acceso excepcional (registrado).</p>
      )}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{p.nombre}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {p.rut}
            {p.edad !== null && ` · ${p.edad} años`}
            {p.sexo && ` · ${p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : p.sexo}`}
            {p.prevision && <span className="capitalize"> · {p.prevision}</span>}
            {ficha.grupoSanguineo && ` · Grupo ${ficha.grupoSanguineo}`}
          </p>
          <p className="text-sm text-slate-500">
            {[p.telefono, p.email].filter(Boolean).join(" · ")}
            {p.tutor && ` · Responsable: ${p.tutor}`}
          </p>
          {alergias && <p className="mt-2 inline-block rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700">⚠ Alergias: {alergias}</p>}
        </div>
        <Link to={`/medico/pacientes/${p.id}/atencion`} className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700">
          + Nueva atención
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Historial */}
        <section className="space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Historial de atenciones</h2>
          {d.atenciones.length === 0 && <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">Sin atenciones registradas.</p>}
          {d.atenciones.map((a) => (
            <article key={a.id} id={`atencion-${a.id}`} className={`rounded-xl border bg-white p-5 ${a.estado === "borrador" ? "border-dashed border-amber-300" : "border-slate-200"} ${a.corregida ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{formatearFechaHora(new Date(a.fecha))}</p>
                  <p className="text-sm text-slate-500">{a.medico}{a.especialidad && ` · ${a.especialidad}`}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {a.estado === "borrador" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Borrador</span>}
                  {a.estado === "firmada" && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">Firmada</span>}
                  {a.corrigeA && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800">Corrección</span>}
                  {a.corregida && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">Corregida</span>}
                </div>
              </div>
              {a.motivoConsulta && <p className="mt-3 text-sm"><span className="text-slate-500">Motivo:</span> {a.motivoConsulta}</p>}
              {a.diagnosticos.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {a.diagnosticos.map((dg) => (
                    <li key={dg.id}>
                      {dg.codigoCie10 && <span className="mr-2 rounded bg-marca-50 px-1.5 py-0.5 font-mono text-xs text-marca-700">{dg.codigoCie10}</span>}
                      {dg.descripcion}
                      {dg.tipo === "secundario" && <span className="text-xs text-slate-400"> (secundario)</span>}
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-marca-700">Ver detalle</summary>
                <div className="mt-3 space-y-3">
                  {a.signosVitales && <Signos s={a.signosVitales as SignosVitales} />}
                  {([["Anamnesis", a.anamnesis], ["Examen físico", a.examenFisico], ["Indicaciones", a.indicaciones], ["Plan", a.plan]] as const).map(
                    ([t, v]) => v && (
                      <div key={t}>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t}</p>
                        <p className="whitespace-pre-wrap text-slate-700">{v}</p>
                      </div>
                    ),
                  )}
                </div>
              </details>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {a.estado === "borrador" && a.propia && (
                  <Link to={`/medico/pacientes/${p.id}/atencion?atencion=${a.id}`} className="font-medium text-marca-700 hover:underline">Continuar borrador</Link>
                )}
                {a.estado === "firmada" && a.propia && !a.corregida && (
                  <Link to={`/medico/pacientes/${p.id}/atencion?corrige=${a.id}`} className="text-slate-600 hover:underline">Agregar corrección</Link>
                )}
                {a.estado === "firmada" && a.indicaciones && (
                  <a href={`/medico/atenciones/${a.id}/imprimir`} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline">Imprimir indicaciones</a>
                )}
              </div>
            </article>
          ))}
        </section>

        {/* Antecedentes, signos y adjuntos */}
        <aside className="space-y-6">
          {d.ultimosSignos && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Últimos signos vitales</h2>
              <p className="mb-3 text-xs text-slate-400">{formatearDia(fechaLocal(new Date(d.ultimosSignos.fecha)))}</p>
              <Signos s={d.ultimosSignos} />
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Antecedentes</h2>
            <Form method="post" className="mt-3 space-y-3">
              <input type="hidden" name="intent" value="antecedentes" />
              <Campo etiqueta="Grupo sanguíneo" name="grupoSanguineo" defaultValue={ficha.grupoSanguineo ?? ""} maxLength={5} />
              {ANTECEDENTES.map(([clave, etiqueta]) => (
                <CampoTexto key={clave} etiqueta={etiqueta} name={clave} rows={2} defaultValue={(ficha[clave] as string | null) ?? ""} />
              ))}
              {r?.seccion === "antecedentes" && (r.ok || r.error) && <Aviso tipo={r.ok ? "ok" : "error"}>{r.ok ?? r.error}</Aviso>}
              <Boton variante="secundario" disabled={enviando}>Guardar antecedentes</Boton>
            </Form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Exámenes y documentos</h2>
            {d.adjuntos.length === 0 && <p className="mt-2 text-sm text-slate-400">Sin archivos.</p>}
            <ul className="mt-2 space-y-2 text-sm">
              {d.adjuntos.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2">
                  <a href={`/medico/adjuntos/${x.id}`} className="truncate text-marca-700 hover:underline">{x.nombre}</a>
                  <span className="shrink-0 text-xs text-slate-400">{Math.ceil(x.tamano / 1024)} KB</span>
                </li>
              ))}
            </ul>
            {d.puedeSubir && (
              <Form method="post" encType="multipart/form-data" className="mt-4 space-y-2">
                <input type="hidden" name="intent" value="subir" />
                <input type="file" name="archivo" accept="application/pdf,image/png,image/jpeg" aria-label="Archivo" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-1.5 file:text-marca-700" required />
                <p className="text-xs text-slate-400">PDF, PNG o JPG · máximo 10 MB</p>
                {r?.seccion === "adjuntos" && (r.ok || r.error) && <Aviso tipo={r.ok ? "ok" : "error"}>{r.ok ?? r.error}</Aviso>}
                <Boton variante="secundario" disabled={enviando}>Subir archivo</Boton>
              </Form>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
