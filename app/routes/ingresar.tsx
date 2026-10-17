import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { clinica } from "~/config/clinica";
import type { Rol } from "~/lib/auth.server";
import { contextoApp } from "~/lib/contexto";
import { inicioPorRol, obtenerUsuario } from "~/lib/sesion.server";
import type { Route } from "./+types/ingresar";

export function meta() {
  return [{ title: `Ingresar · ${clinica.nombre}` }];
}

/** Solo se permite redirigir a rutas internas. */
function destinoSeguro(valor: string | null): string | null {
  return valor && valor.startsWith("/") && !valor.startsWith("//") ? valor : null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const usuario = await obtenerUsuario(request, context);
  if (usuario) throw redirect(inicioPorRol(usuario.role));
  return null;
}

const esquema = z.object({
  email: z.email("Ingresa un correo válido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export async function action({ request, context }: Route.ActionArgs) {
  const formulario = Object.fromEntries(await request.formData());
  const resultado = esquema.safeParse(formulario);
  if (!resultado.success) {
    return data({ error: resultado.error.issues[0].message }, { status: 400 });
  }

  const { auth } = context.get(contextoApp);
  const respuesta = await auth.api.signInEmail({
    body: resultado.data,
    headers: request.headers,
    asResponse: true,
  });
  if (!respuesta.ok) {
    return data({ error: "Correo o contraseña incorrectos" }, { status: 401 });
  }

  const { user } = (await respuesta.json()) as { user: { role: Rol } };
  const headers = new Headers();
  for (const cookie of respuesta.headers.getSetCookie()) headers.append("Set-Cookie", cookie);

  const destino = destinoSeguro(new URL(request.url).searchParams.get("redirigir"));
  return redirect(destino ?? inicioPorRol(user.role), { headers });
}

export default function Ingresar({ actionData }: Route.ComponentProps) {
  const navegacion = useNavigation();
  const enviando = navegacion.state === "submitting";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="block text-center text-lg font-semibold text-marca-700">
          {clinica.nombre}
        </Link>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Ingresar</h1>
          <p className="mt-1 text-sm text-slate-500">Acceso para el personal de la clínica.</p>

          <Form method="post" className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Correo</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Contraseña</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100"
              />
            </label>

            {actionData?.error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {actionData.error}
              </p>
            )}

            <button
              disabled={enviando}
              className="w-full rounded-lg bg-marca-600 px-4 py-2.5 font-medium text-white hover:bg-marca-700 disabled:opacity-60"
            >
              {enviando ? "Ingresando…" : "Ingresar"}
            </button>
          </Form>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Eres paciente? Podrás ingresar con un código enviado a tu correo después de agendar.
        </p>
      </div>
    </main>
  );
}
