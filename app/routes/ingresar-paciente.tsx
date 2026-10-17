import { eq } from "drizzle-orm";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { Aviso, Campo } from "~/components/formulario";
import { clinica } from "~/config/clinica";
import { user } from "~/db/schema";
import { contextoApp } from "~/lib/contexto";
import { inicioPorRol, obtenerUsuario } from "~/lib/sesion.server";
import type { Route } from "./+types/ingresar-paciente";

export function meta() {
  return [{ title: `Mi cuenta · ${clinica.nombre}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const usuario = await obtenerUsuario(request, context);
  if (usuario) throw redirect(inicioPorRol(usuario.role));
  return null;
}

type Resultado = { paso: "correo" | "codigo"; email?: string; error?: string; codigoDemo?: string };

export async function action({ request, context }: Route.ActionArgs) {
  const { db, auth, buzonDemo } = context.get(contextoApp);
  const formulario = await request.formData();
  const email = z.email().safeParse(String(formulario.get("email") ?? "").trim().toLowerCase()).data;
  if (!email) return data<Resultado>({ paso: "correo", error: "Ingresa un correo válido" }, { status: 400 });

  if (formulario.get("intent") === "enviar") {
    // Solo pacientes ingresan con código. La respuesta es la misma exista o no
    // la cuenta, para no revelar qué correos están registrados.
    const [cuenta] = await db.select({ role: user.role }).from(user).where(eq(user.email, email));
    if (cuenta?.role === "paciente") {
      await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    }
    return data<Resultado>({ paso: "codigo", email, codigoDemo: buzonDemo.ultimoCodigo });
  }

  const otp = String(formulario.get("codigo") ?? "").replace(/\D/g, "");
  const respuesta = await auth.api.signInEmailOTP({ body: { email, otp }, headers: request.headers, asResponse: true });
  if (!respuesta.ok) {
    return data<Resultado>({ paso: "codigo", email, error: "Código incorrecto o vencido" }, { status: 401 });
  }
  const headers = new Headers();
  for (const cookie of respuesta.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return redirect("/mi-cuenta", { headers });
}

export default function IngresarPaciente({ actionData }: Route.ComponentProps) {
  const r = actionData as Resultado | undefined;
  const enviando = useNavigation().state === "submitting";
  const paso = r?.paso ?? "correo";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="block text-center text-lg font-semibold text-marca-700">{clinica.nombre}</Link>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Mi cuenta</h1>
          {paso === "correo" ? (
            <Form method="post" className="mt-6 space-y-4">
              <p className="text-sm text-slate-500">Ingresa el correo con que reservaste. Te enviaremos un código de 6 dígitos.</p>
              <input type="hidden" name="intent" value="enviar" />
              <Campo etiqueta="Correo" name="email" type="email" autoComplete="email" required />
              {r?.error && <Aviso tipo="error">{r.error}</Aviso>}
              <button disabled={enviando} className="w-full rounded-lg bg-marca-600 px-4 py-2.5 font-medium text-white hover:bg-marca-700 disabled:opacity-60">
                Enviarme un código
              </button>
            </Form>
          ) : (
            <Form method="post" className="mt-6 space-y-4">
              <p className="text-sm text-slate-500">
                Si <strong>{r?.email}</strong> tiene horas reservadas, recibirás un código. Vence en 10 minutos.
              </p>
              {r?.codigoDemo && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Modo demo (aún no se envían correos): tu código es <strong>{r.codigoDemo}</strong>
                </p>
              )}
              <input type="hidden" name="email" value={r?.email} />
              <input type="hidden" name="intent" value="verificar" />
              <Campo etiqueta="Código" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
              {r?.error && <Aviso tipo="error">{r.error}</Aviso>}
              <button disabled={enviando} className="w-full rounded-lg bg-marca-600 px-4 py-2.5 font-medium text-white hover:bg-marca-700 disabled:opacity-60">
                Ingresar
              </button>
              <Link to="/ingresar/paciente" className="block text-center text-sm text-slate-500 underline" reloadDocument>Usar otro correo</Link>
            </Form>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Eres del equipo de la clínica? <Link to="/ingresar" className="text-marca-700 underline">Ingresa aquí</Link>
        </p>
      </div>
    </main>
  );
}
