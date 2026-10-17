import { eq } from "drizzle-orm";
import { z } from "zod";
import { clinica } from "~/config/clinica";
import { atenciones, diagnosticos, fichasClinicas, medicos } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { fechaLocal, formatearDia } from "~/lib/fechas";
import { formatearRut } from "~/lib/rut";
import { requerirRol } from "~/lib/sesion.server";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { edad, medicoDeUsuario, pacientePorId, tipoAcceso } from "~/modules/fichas.server";
import type { Route } from "./+types/imprimir";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("medico")];

export function meta() {
  return [{ title: "Indicaciones médicas" }];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);
  const id = z.uuid().safeParse(params.id).data;
  const [fila] = id
    ? await db
        .select({ atencion: atenciones, pacienteId: fichasClinicas.pacienteId, medico: medicos })
        .from(atenciones)
        .innerJoin(fichasClinicas, eq(fichasClinicas.id, atenciones.fichaId))
        .innerJoin(medicos, eq(medicos.id, atenciones.medicoId))
        .where(eq(atenciones.id, id))
    : [];
  if (!fila || fila.atencion.estado !== "firmada") throw new Response("Atención no encontrada", { status: 404 });

  const yo = await medicoDeUsuario(db, usuario.id);
  if (!(await tipoAcceso(db, yo, usuario.id, fila.pacienteId))) throw new Response("Sin acceso a esta ficha", { status: 403 });
  const paciente = (await pacientePorId(db, fila.pacienteId))!;
  const diags = await db.select().from(diagnosticos).where(eq(diagnosticos.atencionId, fila.atencion.id));
  await registrarAuditoria(db, request, { usuarioId: usuario.id, accion: "imprimir_indicaciones", entidad: "ficha", entidadId: paciente.id, detalle: { atencionId: fila.atencion.id } });

  return {
    fecha: formatearDia(fechaLocal(fila.atencion.fecha)),
    paciente: { nombre: `${paciente.nombres} ${paciente.apellidos}`, rut: formatearRut(paciente.rut), edad: edad(paciente.fechaNacimiento) },
    medico: { nombre: `${fila.medico.nombres} ${fila.medico.apellidos}`, rut: formatearRut(fila.medico.rut), registro: fila.medico.registroSis },
    diagnosticos: diags.map((d) => `${d.codigoCie10 ? `${d.codigoCie10} ` : ""}${d.descripcion}`),
    indicaciones: fila.atencion.indicaciones ?? "",
    plan: fila.atencion.plan,
  };
}

export default function Imprimir({ loaderData: d }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-2xl bg-white p-10 text-slate-900 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <button onClick={() => window.print()} className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white">Imprimir / Guardar PDF</button>
      </div>
      <header className="border-b border-slate-300 pb-4">
        <p className="text-xl font-bold text-marca-700">{clinica.nombre}</p>
        <p className="text-sm text-slate-600">{clinica.direccion} · {clinica.telefono}</p>
      </header>
      <h1 className="mt-6 text-lg font-semibold">Indicaciones médicas</h1>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-slate-500">Paciente</dt><dd className="font-medium">{d.paciente.nombre}</dd></div>
        <div><dt className="text-slate-500">RUT</dt><dd className="font-medium">{d.paciente.rut}{d.paciente.edad !== null && ` · ${d.paciente.edad} años`}</dd></div>
        <div><dt className="text-slate-500">Fecha</dt><dd className="font-medium">{d.fecha}</dd></div>
      </dl>
      {d.diagnosticos.length > 0 && (
        <section className="mt-6">
          <p className="text-sm font-semibold">Diagnóstico</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{d.diagnosticos.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
      <section className="mt-6">
        <p className="text-sm font-semibold">Indicaciones</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{d.indicaciones}</p>
      </section>
      {d.plan && (
        <section className="mt-6">
          <p className="text-sm font-semibold">Plan</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{d.plan}</p>
        </section>
      )}
      <footer className="mt-20 text-center text-sm">
        <div className="mx-auto w-64 border-t border-slate-400 pt-2">
          <p className="font-medium">{d.medico.nombre}</p>
          <p className="text-slate-600">RUT {d.medico.rut}{d.medico.registro && ` · Reg. SIS ${d.medico.registro}`}</p>
        </div>
        <p className="mt-8 text-xs text-slate-400">Este documento no reemplaza una receta médica electrónica.</p>
      </footer>
    </main>
  );
}
