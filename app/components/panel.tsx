import { Form, NavLink, Outlet } from "react-router";
import { clinica } from "~/config/clinica";
import type { UsuarioSesion } from "~/lib/contexto";

const nombreRol: Record<UsuarioSesion["role"], string> = {
  admin: "Administración",
  recepcion: "Recepción",
  medico: "Médico",
  paciente: "Paciente",
};

/** Estructura común de los portales internos: barra superior + navegación. */
export function Panel({
  usuario,
  enlaces,
}: {
  usuario: UsuarioSesion;
  enlaces: { a: string; texto: string }[];
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <a href="/" className="font-semibold text-marca-700">
              {clinica.nombre}
            </a>
            <nav className="flex gap-1 text-sm">
              {enlaces.map((e) => (
                <NavLink
                  key={e.a}
                  to={e.a}
                  end={e.a === "/admin" || e.a === "/medico"}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 ${isActive ? "bg-marca-50 text-marca-700" : "text-slate-600 hover:bg-slate-100"}`
                  }
                >
                  {e.texto}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {usuario.name} · <span className="text-slate-400">{nombreRol[usuario.role]}</span>
            </span>
            <Form method="post" action="/salir">
              <button className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
                Salir
              </button>
            </Form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function Tarjeta({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{valor}</p>
    </div>
  );
}

export const estiloEstadoCita: Record<string, string> = {
  pendiente_pago: "bg-amber-100 text-amber-800",
  agendada: "bg-sky-100 text-sky-800",
  confirmada: "bg-emerald-100 text-emerald-800",
  atendida: "bg-slate-200 text-slate-700",
  no_asistio: "bg-rose-100 text-rose-800",
  cancelada: "bg-slate-100 text-slate-500 line-through",
};

export const textoEstadoCita: Record<string, string> = {
  pendiente_pago: "Pendiente de pago",
  agendada: "Agendada",
  confirmada: "Confirmada",
  atendida: "Atendida",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
};
