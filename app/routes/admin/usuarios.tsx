import { asc, inArray } from "drizzle-orm";
import { data, Form } from "react-router";
import { z } from "zod";
import { Aviso, Boton, Campo, CampoSelect, Seccion, type ResultadoAccion } from "~/components/formulario";
import { user } from "~/db/schema";
import { contextoApp, contextoUsuario } from "~/lib/contexto";
import { esViolacionUnica, validar } from "~/lib/formularios";
import { requerirRol } from "~/lib/sesion.server";
import { registrarAuditoria } from "~/modules/auditoria.server";
import { cambiarClave, crearUsuarioPersonal } from "~/modules/personal.server";
import type { Route } from "./+types/usuarios";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin")];

export function meta() {
  return [{ title: "Usuarios · Administración" }];
}

const ROLES = { admin: "Administración", recepcion: "Recepción", medico: "Médico" } as const;

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoApp);
  const lista = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(inArray(user.role, ["admin", "recepcion", "medico"]))
    .orderBy(asc(user.role), asc(user.name));
  return { lista };
}

const esquemaNuevo = z.object({
  nombre: z.string().trim().min(2, "Ingresa el nombre"),
  email: z.email("Ingresa un correo válido"),
  rol: z.enum(["admin", "recepcion"], "Elige un rol"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});
const esquemaClave = z.object({
  userId: z.string().min(1),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function action({ request, context }: Route.ActionArgs) {
  const { db } = context.get(contextoApp);
  const admin = context.get(contextoUsuario);
  const formulario = await request.formData();
  const intencion = formulario.get("intent");

  if (intencion === "crear") {
    const r = validar(esquemaNuevo, formulario);
    if (!r.ok) return data<ResultadoAccion>({ seccion: "nuevo", errores: r.errores }, { status: 400 });
    try {
      const id = await crearUsuarioPersonal(db, r.datos);
      await registrarAuditoria(db, request, { usuarioId: admin.id, accion: "crear", entidad: "usuario", entidadId: id, detalle: { rol: r.datos.rol } });
    } catch (error) {
      if (esViolacionUnica(error)) {
        return data<ResultadoAccion>({ seccion: "nuevo", errores: { email: "Ya existe un usuario con ese correo" } }, { status: 400 });
      }
      throw error;
    }
    return data<ResultadoAccion>({ seccion: "nuevo", ok: "Usuario creado" });
  }

  if (intencion === "clave") {
    const r = validar(esquemaClave, formulario);
    const userId = String(formulario.get("userId") ?? "");
    if (!r.ok) return data<ResultadoAccion>({ seccion: userId, errores: r.errores }, { status: 400 });
    await cambiarClave(db, r.datos.userId, r.datos.password);
    await registrarAuditoria(db, request, { usuarioId: admin.id, accion: "cambiar_clave", entidad: "usuario", entidadId: r.datos.userId });
    return data<ResultadoAccion>({ seccion: userId, ok: "Contraseña actualizada y sesiones cerradas" });
  }

  return data<ResultadoAccion>({ seccion: "", error: "Acción no válida" }, { status: 400 });
}

export default function Usuarios({ loaderData, actionData }: Route.ComponentProps) {
  const r = actionData as ResultadoAccion | undefined;
  const errNuevo = r?.seccion === "nuevo" ? (r.errores ?? {}) : {};

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Usuarios</h1>
      <p className="mt-1 text-sm text-slate-500">
        Personal con acceso al sistema. Los médicos se crean desde la sección Médicos.
      </p>

      <div className="mt-6 space-y-6">
        <Seccion titulo="Nuevo usuario">
          <Form method="post" className="grid items-start gap-4 sm:grid-cols-5">
            <input type="hidden" name="intent" value="crear" />
            <Campo etiqueta="Nombre" name="nombre" error={errNuevo.nombre} required />
            <Campo etiqueta="Correo" name="email" type="email" error={errNuevo.email} required />
            <CampoSelect etiqueta="Rol" name="rol" error={errNuevo.rol}>
              <option value="recepcion">Recepción</option>
              <option value="admin">Administración</option>
            </CampoSelect>
            <Campo etiqueta="Contraseña inicial" name="password" type="text" autoComplete="off" error={errNuevo.password} required />
            <div className="self-end"><Boton className="w-full">Crear</Boton></div>
          </Form>
          {r?.seccion === "nuevo" && r.ok && <div className="mt-3"><Aviso tipo="ok">{r.ok}</Aviso></div>}
        </Seccion>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Cambiar contraseña</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.lista.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">{ROLES[u.role as keyof typeof ROLES]}</td>
                  <td className="px-4 py-3">
                    <Form method="post" className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="intent" value="clave" />
                      <input type="hidden" name="userId" value={u.id} />
                      <input
                        name="password"
                        type="text"
                        autoComplete="off"
                        placeholder="Nueva contraseña"
                        aria-label={`Nueva contraseña de ${u.name}`}
                        className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-marca-500"
                      />
                      <Boton variante="secundario" className="!py-1.5">Cambiar</Boton>
                      {r?.seccion === u.id && r.ok && <span className="text-xs text-emerald-700">{r.ok}</span>}
                      {r?.seccion === u.id && r.errores?.password && <span className="text-xs text-rose-600">{r.errores.password}</span>}
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
