import { Link, NavLink, Outlet } from "react-router";
import { clinica } from "~/config/clinica";

export default function LayoutPublico() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-lg font-semibold text-marca-700">
            {clinica.nombre}
          </Link>
          <nav className="flex flex-wrap items-center gap-x-1 text-sm">
            {[
              { a: "/especialidades", texto: "Especialidades" },
              { a: "/medicos", texto: "Médicos" },
            ].map((e) => (
              <NavLink
                key={e.a}
                to={e.a}
                className={({ isActive }) =>
                  `rounded-md px-2 py-2 sm:px-3 ${isActive ? "text-marca-700" : "text-slate-600 hover:text-slate-900"}`
                }
              >
                {e.texto}
              </NavLink>
            ))}
            <Link to="/ingresar/paciente" className="rounded-md px-2 py-2 text-slate-600 hover:text-slate-900 sm:px-3">
              Mi cuenta
            </Link>
            <Link
              to="/agendar"
              className="ml-1 whitespace-nowrap rounded-lg bg-marca-600 px-3 py-2 font-medium sm:ml-2 sm:px-4 text-white hover:bg-marca-700"
            >
              Agendar hora
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-900">{clinica.nombre}</p>
            <p className="mt-1">{clinica.eslogan}</p>
          </div>
          <div>
            <p>{clinica.direccion}</p>
            <p>{clinica.horarioAtencion}</p>
          </div>
          <div>
            <p>Teléfono: {clinica.telefono}</p>
            <p>WhatsApp: {clinica.whatsapp}</p>
            <p>{clinica.email}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
