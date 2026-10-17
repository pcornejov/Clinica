import { and, asc, eq, ilike, or } from "drizzle-orm";
import { Form, Link } from "react-router";
import { citas, pacientes } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { formatearRut, normalizarRut } from "~/lib/rut";
import { edad, medicoDeUsuario } from "~/modules/fichas.server";
import type { Route } from "./+types/pacientes";

export function meta() {
  return [{ title: "Pacientes · Portal médico" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const medico = await medicoDeUsuario(db, context.get(contextoUsuario).id);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

  // Mis pacientes: quienes tienen o tuvieron cita conmigo.
  const rut = normalizarRut(q);
  const filtroTexto = q.length >= 2
    ? or(ilike(pacientes.nombres, `%${q}%`), ilike(pacientes.apellidos, `%${q}%`), rut ? eq(pacientes.rut, rut) : undefined)
    : undefined;
  const mios = await db
    .selectDistinct({ id: pacientes.id, rut: pacientes.rut, nombres: pacientes.nombres, apellidos: pacientes.apellidos, fechaNacimiento: pacientes.fechaNacimiento })
    .from(pacientes)
    .innerJoin(citas, eq(citas.pacienteId, pacientes.id))
    .where(and(eq(citas.medicoId, medico.id), filtroTexto))
    .orderBy(asc(pacientes.apellidos))
    .limit(50);

  // Búsqueda por RUT exacto de un paciente que no es mío: acceso excepcional.
  let otro = null;
  if (rut && !mios.some((p) => p.rut === rut)) {
    const [p] = await db.select({ id: pacientes.id, nombres: pacientes.nombres, apellidos: pacientes.apellidos }).from(pacientes).where(eq(pacientes.rut, rut));
    otro = p ?? null;
  }

  return {
    q,
    pacientes: mios.map((p) => ({ ...p, rut: formatearRut(p.rut), edad: edad(p.fechaNacimiento) })),
    otro,
  };
}

export default function Pacientes({ loaderData }: Route.ComponentProps) {
  const { q, pacientes: lista, otro } = loaderData;
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Pacientes</h1>
      <Form method="get" className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o RUT"
          aria-label="Buscar paciente"
          className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-marca-500"
        />
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">Buscar</button>
      </Form>
      <p className="mt-2 text-xs text-slate-400">Se muestran tus pacientes. Para otro paciente, búscalo por su RUT completo.</p>

      {otro && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {otro.nombres} {otro.apellidos} no es paciente tuyo.{" "}
          <Link to={`/medico/pacientes/${otro.id}`} className="font-medium underline">Solicitar acceso excepcional a su ficha</Link>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {lista.length === 0 && <p className="px-5 py-8 text-center text-slate-400">Sin resultados.</p>}
        <ul className="divide-y divide-slate-100">
          {lista.map((p) => (
            <li key={p.id}>
              <Link to={`/medico/pacientes/${p.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                <span className="font-medium text-slate-900">{p.nombres} {p.apellidos}</span>
                <span className="text-slate-500">{p.rut}{p.edad !== null && ` · ${p.edad} años`}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
