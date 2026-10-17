import { eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useFetcher, useNavigation } from "react-router";
import { z } from "zod";
import { Aviso, Campo, CampoTexto } from "~/components/formulario";
import { atenciones, citas, diagnosticos, type SignosVitales } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { formatearFechaHora } from "~/lib/fechas";
import { validar } from "~/lib/formularios";
import { formatearRut } from "~/lib/rut";
import { esquemaAtencion, guardarAtencion, medicoDeUsuario, obtenerFicha, pacientePorId, tipoAcceso } from "~/modules/fichas.server";
import { edad, imc } from "~/modules/clinico";
import type { Route } from "./+types/atencion";

export function meta() {
  return [{ title: "Atención · Portal médico" }];
}

async function preparar({ params, request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);
  if (!z.uuid().safeParse(params.id).success) throw new Response("Paciente no encontrado", { status: 404 });
  const paciente = await pacientePorId(db, params.id);
  if (!paciente) throw new Response("Paciente no encontrado", { status: 404 });
  const medico = await medicoDeUsuario(db, usuario.id);
  if (!(await tipoAcceso(db, medico, usuario.id, paciente.id))) throw redirect(`/medico/pacientes/${paciente.id}`);
  const url = new URL(request.url);
  const id = (k: string) => z.uuid().safeParse(url.searchParams.get(k)).data ?? null;
  return { db, usuario, paciente, medico, citaId: id("cita"), atencionId: id("atencion"), corrigeA: id("corrige") };
}

export async function loader(args: Route.LoaderArgs) {
  const { db, paciente, medico, citaId, atencionId, corrigeA } = await preparar(args);
  const ficha = await obtenerFicha(db, paciente.id);

  // Borrador existente de esta cita: se continúa en vez de crear otro.
  let idBorrador = atencionId;
  if (!idBorrador && citaId) {
    const [previa] = await db.select().from(atenciones).where(eq(atenciones.citaId, citaId));
    if (previa?.estado === "firmada") throw redirect(`/medico/pacientes/${paciente.id}#atencion-${previa.id}`);
    if (previa && previa.medicoId === medico.id) idBorrador = previa.id;
  }

  // Valores iniciales: borrador, atención a corregir o motivo de la cita.
  const base = idBorrador ?? corrigeA;
  const [origen] = base ? await db.select().from(atenciones).where(eq(atenciones.id, base)) : [];
  if (origen && origen.fichaId !== ficha.id) throw new Response("Atención no válida", { status: 404 });
  if (idBorrador && origen && (origen.estado !== "borrador" || origen.medicoId !== medico.id)) {
    throw redirect(`/medico/pacientes/${paciente.id}`);
  }
  const diags = origen ? await db.select().from(diagnosticos).where(eq(diagnosticos.atencionId, origen.id)) : [];
  const [cita] = citaId ? await db.select().from(citas).where(eq(citas.id, citaId)) : [];

  return {
    paciente: {
      id: paciente.id,
      nombre: `${paciente.nombres} ${paciente.apellidos}`,
      rut: formatearRut(paciente.rut),
      edad: edad(paciente.fechaNacimiento),
    },
    alergias: ficha.alergias && !/^no refiere$/i.test(ficha.alergias.trim()) ? ficha.alergias : null,
    cronicas: ficha.enfermedadesCronicas,
    modo: idBorrador ? ("borrador" as const) : corrigeA ? ("correccion" as const) : ("nueva" as const),
    correccionDe: corrigeA && origen ? formatearFechaHora(origen.fecha) : null,
    inicial: {
      motivoConsulta: origen?.motivoConsulta ?? cita?.motivoConsulta ?? "",
      anamnesis: origen?.anamnesis ?? "",
      examenFisico: origen?.examenFisico ?? "",
      indicaciones: origen?.indicaciones ?? "",
      plan: origen?.plan ?? "",
      signos: (origen?.signosVitales as SignosVitales | null) ?? {},
      diagnosticos: diags.map((d) => ({ codigo: d.codigoCie10 ?? "", descripcion: d.descripcion })),
    },
    ids: { atencionId: idBorrador, citaId, corrigeA },
  };
}

export async function action(args: Route.ActionArgs) {
  const { db, usuario, paciente, medico } = await preparar(args);
  const formulario = await args.request.formData();
  const r = validar(esquemaAtencion, formulario, ["diagCodigo", "diagDescripcion"]);
  if (!r.ok) return data({ errores: r.errores, error: "Revisa los campos marcados" }, { status: 400 });

  const id = (k: string) => z.uuid().safeParse(formulario.get(k)).data ?? null;
  const resultado = await guardarAtencion(db, args.request, {
    medico,
    userId: usuario.id,
    pacienteId: paciente.id,
    atencionId: id("atencionId"),
    citaId: id("citaId"),
    corrigeA: id("corrigeA"),
    datos: r.datos,
    firmar: formulario.get("intent") === "firmar",
  });
  if ("error" in resultado) return data({ errores: {} as Record<string, string>, error: resultado.error }, { status: 400 });
  return redirect(`/medico/pacientes/${paciente.id}#atencion-${resultado.atencionId}`);
}

type Diagnostico = { codigo: string; descripcion: string };

/** Lista de diagnósticos con buscador CIE-10 (el primero es el principal). */
function Diagnosticos({ iniciales }: { iniciales: Diagnostico[] }) {
  const [lista, setLista] = useState<Diagnostico[]>(iniciales.length ? iniciales : [{ codigo: "", descripcion: "" }]);
  const [busqueda, setBusqueda] = useState({ fila: -1, texto: "" });
  const fetcher = useFetcher<{ resultados: { codigo: string; descripcion: string }[] }>();

  useEffect(() => {
    if (busqueda.texto.trim().length < 2) return;
    const t = setTimeout(() => fetcher.load(`/medico/cie10?q=${encodeURIComponent(busqueda.texto)}`), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda.texto]);

  const cambiar = (i: number, cambio: Partial<Diagnostico>) => setLista((l) => l.map((d, j) => (j === i ? { ...d, ...cambio } : d)));
  const resultados = busqueda.texto.trim().length >= 2 ? (fetcher.data?.resultados ?? []) : [];

  return (
    <div className="space-y-3">
      {lista.map((d, i) => (
        <div key={i} className="relative rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">{i === 0 ? "Diagnóstico principal" : "Diagnóstico secundario"}</p>
          <input type="hidden" name="diagCodigo" value={d.codigo} />
          <div className="flex gap-2">
            <span className={`flex w-20 shrink-0 items-center justify-center rounded-lg border font-mono text-sm ${d.codigo ? "border-marca-100 bg-marca-50 text-marca-700" : "border-dashed border-slate-300 text-slate-400"}`}>
              {d.codigo || "CIE-10"}
            </span>
            <input
              name="diagDescripcion"
              value={d.descripcion}
              onChange={(e) => {
                cambiar(i, { descripcion: e.target.value, codigo: "" });
                setBusqueda({ fila: i, texto: e.target.value });
              }}
              placeholder="Escribe para buscar en CIE-10 (ej. lumbago, J06)"
              aria-label={i === 0 ? "Diagnóstico principal" : `Diagnóstico secundario ${i}`}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-500"
            />
            {lista.length > 1 && (
              <button type="button" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-rose-600" aria-label="Quitar diagnóstico">
                ✕
              </button>
            )}
          </div>
          {busqueda.fila === i && resultados.length > 0 && (
            <ul className="absolute left-3 right-3 z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {resultados.map((c) => (
                <li key={c.codigo}>
                  <button
                    type="button"
                    onClick={() => {
                      cambiar(i, c);
                      setBusqueda({ fila: -1, texto: "" });
                    }}
                    className="flex w-full gap-3 px-3 py-2 text-left text-sm hover:bg-marca-50"
                  >
                    <span className="w-14 shrink-0 font-mono text-marca-700">{c.codigo}</span>
                    <span>{c.descripcion}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setLista((l) => [...l, { codigo: "", descripcion: "" }])} className="text-sm text-marca-700 hover:underline">
        + Agregar diagnóstico
      </button>
      <p className="text-xs text-slate-400">Puedes escribir un diagnóstico sin código si no está en el catálogo.</p>
    </div>
  );
}

const CAMPOS_SIGNOS: [keyof SignosVitales, string, string][] = [
  ["presionSistolica", "PA sistólica", "mmHg"],
  ["presionDiastolica", "PA diastólica", "mmHg"],
  ["frecuenciaCardiaca", "Frec. cardíaca", "lpm"],
  ["frecuenciaRespiratoria", "Frec. respiratoria", "rpm"],
  ["temperatura", "Temperatura", "°C"],
  ["saturacion", "Saturación O₂", "%"],
  ["pesoKg", "Peso", "kg"],
  ["tallaCm", "Talla", "cm"],
];

export default function NuevaAtencion({ loaderData, actionData }: Route.ComponentProps) {
  const d = loaderData;
  const errores = actionData?.errores ?? {};
  const enviando = useNavigation().state === "submitting";
  const [peso, setPeso] = useState(String(d.inicial.signos.pesoKg ?? ""));
  const [talla, setTalla] = useState(String(d.inicial.signos.tallaCm ?? ""));
  const valorImc = imc(Number(peso.replace(",", ".")) || undefined, Number(talla.replace(",", ".")) || undefined);

  return (
    <>
      <Link to={`/medico/pacientes/${d.paciente.id}`} className="text-sm text-marca-700 hover:underline">← Ficha de {d.paciente.nombre}</Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        {d.modo === "correccion" ? "Corrección de atención" : d.modo === "borrador" ? "Continuar atención" : "Nueva atención"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{d.paciente.nombre} · {d.paciente.rut}{d.paciente.edad !== null && ` · ${d.paciente.edad} años`}</p>
      {d.alergias && <p className="mt-2 inline-block rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700">⚠ Alergias: {d.alergias}</p>}
      {d.cronicas && !/^no refiere$/i.test(d.cronicas) && <p className="mt-1 text-sm text-slate-600">Crónicas: {d.cronicas}</p>}
      {d.modo === "correccion" && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          La atención del {d.correccionDe} quedará marcada como corregida, pero no se borra (Ley 20.584). Ajusta lo que corresponda y firma.
        </p>
      )}

      <Form method="post" className="mt-6 space-y-6">
        {d.ids.atencionId && <input type="hidden" name="atencionId" value={d.ids.atencionId} />}
        {d.ids.citaId && <input type="hidden" name="citaId" value={d.ids.citaId} />}
        {d.ids.corrigeA && <input type="hidden" name="corrigeA" value={d.ids.corrigeA} />}

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <Campo etiqueta="Motivo de consulta" name="motivoConsulta" defaultValue={d.inicial.motivoConsulta} error={errores.motivoConsulta} required />
          <CampoTexto etiqueta="Anamnesis" name="anamnesis" rows={4} defaultValue={d.inicial.anamnesis} />
          <CampoTexto etiqueta="Examen físico" name="examenFisico" rows={3} defaultValue={d.inicial.examenFisico} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Signos vitales</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {CAMPOS_SIGNOS.map(([clave, etiqueta, unidad]) => (
              <Campo
                key={clave}
                etiqueta={`${etiqueta} (${unidad})`}
                name={clave}
                inputMode="decimal"
                defaultValue={clave === "pesoKg" || clave === "tallaCm" ? undefined : String(d.inicial.signos[clave] ?? "")}
                value={clave === "pesoKg" ? peso : clave === "tallaCm" ? talla : undefined}
                onChange={clave === "pesoKg" ? (e) => setPeso(e.target.value) : clave === "tallaCm" ? (e) => setTalla(e.target.value) : undefined}
                error={errores[clave]}
              />
            ))}
          </div>
          {valorImc && <p className="mt-3 text-sm text-slate-600">IMC: <strong>{valorImc}</strong></p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Diagnósticos</h2>
          <Diagnosticos iniciales={d.inicial.diagnosticos} />
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <CampoTexto etiqueta="Indicaciones al paciente" name="indicaciones" rows={4} defaultValue={d.inicial.indicaciones} ayuda="Se pueden imprimir para entregar al paciente" />
          <CampoTexto etiqueta="Plan (exámenes, derivaciones, control)" name="plan" rows={3} defaultValue={d.inicial.plan} />
        </section>

        {actionData?.error && <Aviso tipo="error">{actionData.error}</Aviso>}

        <div className="flex flex-wrap justify-end gap-3">
          <button name="intent" value="borrador" disabled={enviando} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">
            Guardar borrador
          </button>
          <button
            name="intent"
            value="firmar"
            disabled={enviando}
            onClick={(e) => {
              if (!confirm("Una vez firmada, la atención no se puede modificar. ¿Firmar?")) e.preventDefault();
            }}
            className="rounded-lg bg-marca-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-marca-700 disabled:opacity-60"
          >
            Firmar atención
          </button>
        </div>
      </Form>
    </>
  );
}

