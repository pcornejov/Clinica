import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Form } from "react-router";
import { auditoria, pacientes, user } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { formatearFechaHora } from "~/lib/fechas";
import { formatearRut, normalizarRut } from "~/lib/rut";
import { requerirRol } from "~/lib/sesion.server";
import type { Route } from "./+types/auditoria";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin")];

export function meta() {
  return [{ title: "Auditoría · Administración" }];
}

const TEXTO_ACCION: Record<string, string> = {
  ver_ficha: "Abrió la ficha",
  acceso_excepcional: "Acceso excepcional",
  editar_antecedentes: "Editó antecedentes",
  guardar_borrador: "Guardó borrador de atención",
  firmar_atencion: "Firmó atención",
  firmar_correccion: "Firmó corrección",
  subir_adjunto: "Subió archivo",
  descargar_adjunto: "Descargó archivo",
  imprimir_indicaciones: "Imprimió indicaciones",
};

/**
 * Quién accedió a qué ficha y cuándo (sin mostrar contenido clínico).
 * Permite revisar especialmente los accesos excepcionales.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const url = new URL(request.url);
  const rut = normalizarRut(url.searchParams.get("rut") ?? "");
  const soloExcepcionales = url.searchParams.get("excepcionales") === "1";

  let pacienteId: string | undefined;
  if (rut) {
    const [p] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.rut, rut));
    pacienteId = p?.id ?? "00000000-0000-0000-0000-000000000000";
  }

  const filas = await db
    .select({ a: auditoria, usuario: user.name, paciente: { nombres: pacientes.nombres, apellidos: pacientes.apellidos, rut: pacientes.rut } })
    .from(auditoria)
    .leftJoin(user, eq(user.id, auditoria.userId))
    // entidad_id es texto (sirve para cualquier entidad); se compara como texto.
    .leftJoin(pacientes, sql`${pacientes.id}::text = ${auditoria.entidadId}`)
    .where(
      and(
        eq(auditoria.entidad, "ficha"),
        soloExcepcionales ? eq(auditoria.accion, "acceso_excepcional") : inArray(auditoria.accion, Object.keys(TEXTO_ACCION)),
        pacienteId ? eq(auditoria.entidadId, pacienteId) : undefined,
      ),
    )
    .orderBy(desc(auditoria.creadoEn))
    .limit(200);

  return {
    filtros: { rut: url.searchParams.get("rut") ?? "", soloExcepcionales },
    filas: filas.map(({ a, usuario, paciente }) => ({
      id: a.id,
      cuando: formatearFechaHora(a.creadoEn),
      quien: usuario ?? "—",
      accion: TEXTO_ACCION[a.accion] ?? a.accion,
      excepcional: a.accion === "acceso_excepcional" || (a.detalle as { acceso?: string } | null)?.acceso === "excepcional",
      motivo: a.accion === "acceso_excepcional" ? String((a.detalle as { motivo?: string } | null)?.motivo ?? "") : null,
      paciente: paciente ? `${paciente.nombres} ${paciente.apellidos} · ${formatearRut(paciente.rut)}` : "—",
      ip: a.ip,
    })),
  };
}

export default function Auditoria({ loaderData }: Route.ComponentProps) {
  const { filtros, filas } = loaderData;
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Auditoría de fichas clínicas</h1>
      <p className="mt-1 text-sm text-slate-500">Registro inalterable de quién accedió a cada ficha (Ley 20.584). No muestra contenido clínico.</p>
      <Form method="get" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <input name="rut" defaultValue={filtros.rut} placeholder="RUT del paciente" aria-label="RUT del paciente" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="excepcionales" value="1" defaultChecked={filtros.soloExcepcionales} className="accent-marca-600" />
          Solo accesos excepcionales
        </label>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50">Filtrar</button>
      </Form>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cuándo</th>
              <th className="px-4 py-3 font-medium">Quién</th>
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Paciente</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Sin registros.</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} className={`border-b border-slate-100 align-top last:border-0 ${f.excepcional ? "bg-amber-50" : ""}`}>
                <td className="whitespace-nowrap px-4 py-3">{f.cuando}</td>
                <td className="px-4 py-3">{f.quien}</td>
                <td className="px-4 py-3">
                  {f.accion}
                  {f.motivo && <p className="text-xs text-amber-800">Motivo: {f.motivo}</p>}
                </td>
                <td className="px-4 py-3">{f.paciente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
