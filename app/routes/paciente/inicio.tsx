import { desc, eq, inArray, or } from "drizzle-orm";
import { Link } from "react-router";
import { estiloEstadoCita, textoEstadoCita } from "~/components/panel";
import { citas, especialidades, medicos, pacientes } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { formatearFechaHora } from "~/lib/fechas";
import { crearTokenGestion } from "~/lib/token-gestion.server";
import { ESTADOS_GESTIONABLES } from "~/modules/citas.server";
import type { Route } from "./+types/inicio";

export function meta() {
  return [{ title: "Mis citas" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { db, env } = context.get(contextoApp);
  const usuario = context.get(contextoUsuario);

  const [titular] = await db.select().from(pacientes).where(eq(pacientes.userId, usuario.id));
  if (!titular) return { proximas: [], pasadas: [], familia: [] };

  // El titular y las personas a su cargo.
  const familia = await db
    .select({ id: pacientes.id, nombres: pacientes.nombres, apellidos: pacientes.apellidos })
    .from(pacientes)
    .where(or(eq(pacientes.id, titular.id), eq(pacientes.tutorId, titular.id)));
  const nombrePorId = new Map(familia.map((p) => [p.id, `${p.nombres} ${p.apellidos}`]));

  const lista = await db
    .select({
      id: citas.id,
      pacienteId: citas.pacienteId,
      inicio: citas.inicio,
      estado: citas.estado,
      medico: medicos.nombres,
      medicoApellidos: medicos.apellidos,
      especialidad: especialidades.nombre,
    })
    .from(citas)
    .innerJoin(medicos, eq(medicos.id, citas.medicoId))
    .innerJoin(especialidades, eq(especialidades.id, citas.especialidadId))
    .where(inArray(citas.pacienteId, familia.map((p) => p.id)))
    .orderBy(desc(citas.inicio));

  const ahora = new Date();
  const conLink = await Promise.all(
    lista.map(async (c) => ({
      ...c,
      inicio: c.inicio.toISOString(),
      paciente: nombrePorId.get(c.pacienteId) ?? "",
      deFamiliar: c.pacienteId !== titular.id,
      token: await crearTokenGestion(c.id, env.BETTER_AUTH_SECRET),
      futura: c.inicio > ahora && (ESTADOS_GESTIONABLES as readonly string[]).includes(c.estado),
    })),
  );
  return {
    proximas: conLink.filter((c) => c.futura).reverse(),
    pasadas: conLink.filter((c) => !c.futura),
    familia: familia.filter((p) => p.id !== titular.id).map((p) => `${p.nombres} ${p.apellidos}`),
  };
}

type Fila = Route.ComponentProps["loaderData"]["proximas"][number];

function TarjetaCita({ c }: { c: Fila }) {
  return (
    <Link
      to={`/cita/${c.token}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 hover:border-marca-500"
    >
      <div>
        <p className="font-medium text-slate-900">{formatearFechaHora(new Date(c.inicio))}</p>
        <p className="text-sm text-slate-500">
          {c.especialidad} · {c.medico} {c.medicoApellidos}
          {c.deFamiliar && <span className="text-marca-700"> · {c.paciente}</span>}
        </p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs ${estiloEstadoCita[c.estado]}`}>{textoEstadoCita[c.estado]}</span>
    </Link>
  );
}

export default function MisCitas({ loaderData }: Route.ComponentProps) {
  const { proximas, pasadas, familia } = loaderData;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Mis citas</h1>
        <Link to="/agendar" className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700">
          Agendar hora
        </Link>
      </div>
      {familia.length > 0 && <p className="mt-2 text-sm text-slate-500">Incluye las citas de: {familia.join(", ")}.</p>}

      <h2 className="mt-8 font-semibold text-slate-900">Próximas</h2>
      <div className="mt-3 space-y-3">
        {proximas.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">No tienes horas próximas.</p>
        )}
        {proximas.map((c) => <TarjetaCita key={c.id} c={c} />)}
      </div>

      {pasadas.length > 0 && (
        <>
          <h2 className="mt-10 font-semibold text-slate-900">Anteriores</h2>
          <div className="mt-3 space-y-3">
            {pasadas.slice(0, 20).map((c) => <TarjetaCita key={c.id} c={c} />)}
          </div>
        </>
      )}
    </>
  );
}
