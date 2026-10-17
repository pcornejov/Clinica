import { asc, eq } from "drizzle-orm";
import { Link } from "react-router";
import { canalesAviso, clinica } from "~/config/clinica";
import { especialidades } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { formatearPesos } from "~/lib/fechas";
import type { Route } from "./+types/inicio";

export function meta() {
  return [
    { title: `${clinica.nombre} · Agenda tu hora en línea` },
    { name: "description", content: clinica.descripcion },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const lista = await db
    .select()
    .from(especialidades)
    .where(eq(especialidades.activa, true))
    .orderBy(asc(especialidades.nombre));
  return { especialidades: lista };
}

export default function Inicio({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <section className="bg-gradient-to-b from-marca-50 to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {clinica.eslogan}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">{clinica.descripcion}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/agendar"
              className="rounded-lg bg-marca-600 px-5 py-3 font-medium text-white hover:bg-marca-700"
            >
              Agendar hora
            </Link>
            <Link
              to="/medicos"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium hover:bg-slate-50"
            >
              Conoce a nuestros médicos
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold text-slate-900">Especialidades</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loaderData.especialidades.map((e) => (
            <Link key={e.id} to={`/agendar?especialidad=${e.id}`} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-marca-500">
              <p className="font-medium text-slate-900">{e.nombre}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{e.descripcion}</p>
              <p className="mt-3 text-sm text-marca-700">{formatearPesos(e.precio)} · Agendar →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3">
          {[
            ["Agenda en línea", "Elige especialidad, médico y horario, las 24 horas del día."],
            ["Recordatorios", `Te avisamos por ${canalesAviso()} antes de tu hora.`],
            ["Paga como prefieras", "En línea con Webpay o Mercado Pago, o directamente en la clínica."],
          ].map(([titulo, texto]) => (
            <div key={titulo}>
              <p className="font-semibold text-slate-900">{titulo}</p>
              <p className="mt-2 text-slate-600">{texto}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
