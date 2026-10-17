import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { Form, Link, useSearchParams } from "react-router";
import { z } from "zod";
import { Tarjeta } from "~/components/panel";
import { citas, especialidades, pacientes, pagos, user } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { aInstante, fechaLocal, formatearDia, formatearHora, formatearPesos, sumarDias } from "~/lib/fechas";
import { TEXTO_MEDIO } from "~/modules/pagos.server";
import type { Route } from "./+types/caja";

export function meta() {
  return [{ title: "Caja · Recepción" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const hoy = fechaLocal(new Date());
  const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(new URL(request.url).searchParams.get("fecha")).data ?? hoy;
  const desde = aInstante(fecha, "00:00");
  const hasta = aInstante(sumarDias(fecha, 1), "00:00");

  const lista = await db
    .select({
      id: pagos.id,
      medio: pagos.medio,
      estado: pagos.estado,
      monto: pagos.monto,
      folio: pagos.referenciaExterna,
      pagadoEn: pagos.pagadoEn,
      paciente: { nombres: pacientes.nombres, apellidos: pacientes.apellidos },
      especialidad: especialidades.nombre,
      cajero: user.name,
    })
    .from(pagos)
    .innerJoin(citas, eq(citas.id, pagos.citaId))
    .innerJoin(pacientes, eq(pacientes.id, citas.pacienteId))
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .leftJoin(user, eq(user.id, pagos.registradoPor))
    .where(and(inArray(pagos.estado, ["pagado", "reembolsado"]), gte(pagos.pagadoEn, desde), lt(pagos.pagadoEn, hasta)))
    .orderBy(asc(pagos.pagadoEn));

  const vigentes = lista.filter((p) => p.estado === "pagado");
  const porMedio = new Map<string, { cantidad: number; total: number }>();
  for (const p of vigentes) {
    const t = porMedio.get(p.medio) ?? { cantidad: 0, total: 0 };
    porMedio.set(p.medio, { cantidad: t.cantidad + 1, total: t.total + p.monto });
  }
  return {
    fecha,
    hoy,
    total: vigentes.reduce((s, p) => s + p.monto, 0),
    porMedio: [...porMedio.entries()].map(([medio, t]) => ({ medio: TEXTO_MEDIO[medio], ...t })).sort((a, b) => b.total - a.total),
    lista: lista.map((p) => ({
      ...p,
      medio: TEXTO_MEDIO[p.medio],
      hora: p.pagadoEn ? formatearHora(p.pagadoEn) : "",
      // El folio solo es útil en bonos; en Webpay es el token interno.
      folio: p.medio === "webpay" ? null : p.folio,
    })),
  };
}

export default function Caja({ loaderData }: Route.ComponentProps) {
  const d = loaderData;
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
          <h1 className="text-2xl font-semibold text-slate-900">Caja</h1>
          <p className="mt-1 text-slate-500">{formatearDia(d.fecha)}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link to={conFecha(sumarDias(d.fecha, -1))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">← Anterior</Link>
          <Form method="get"><input type="date" name="fecha" defaultValue={d.fecha} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5" aria-label="Fecha" /></Form>
          <Link to={conFecha(sumarDias(d.fecha, 1))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Siguiente →</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Total del día" valor={formatearPesos(d.total)} />
        {d.porMedio.slice(0, 3).map((m) => (
          <Tarjeta key={m.medio} titulo={`${m.medio} (${m.cantidad})`} valor={formatearPesos(m.total)} />
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Hora</th>
              <th className="px-4 py-3 font-medium">Paciente</th>
              <th className="px-4 py-3 font-medium">Medio</th>
              <th className="px-4 py-3 font-medium">Registró</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {d.lista.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sin pagos este día.</td></tr>
            )}
            {d.lista.map((p) => (
              <tr key={p.id} className={`border-b border-slate-100 last:border-0 ${p.estado === "reembolsado" ? "text-slate-400 line-through" : ""}`}>
                <td className="px-4 py-3">{p.hora}</td>
                <td className="px-4 py-3">{p.paciente.nombres} {p.paciente.apellidos}<span className="text-slate-400"> · {p.especialidad}</span></td>
                <td className="px-4 py-3">{p.medio}{p.folio && <span className="text-slate-400"> · folio {p.folio}</span>}</td>
                <td className="px-4 py-3">{p.cajero ?? "En línea"}</td>
                <td className="px-4 py-3 text-right font-medium">{formatearPesos(p.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
