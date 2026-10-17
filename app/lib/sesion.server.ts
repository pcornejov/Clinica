import { redirect, type MiddlewareFunction, type RouterContextProvider } from "react-router";
import type { Rol } from "./auth.server";
import { contextoApp, contextoUsuario, type UsuarioSesion } from "./contexto";

export async function obtenerUsuario(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<UsuarioSesion | null> {
  const { auth } = context.get(contextoApp);
  const sesion = await auth.api.getSession({ headers: request.headers });
  if (!sesion) return null;
  const { id, name, email, role } = sesion.user;
  return { id, name, email, role: role as Rol };
}

/** Página de inicio de cada rol después de ingresar. */
export function inicioPorRol(rol: Rol): string {
  switch (rol) {
    case "admin":
    case "recepcion":
      return "/admin";
    case "medico":
      return "/medico";
    case "paciente":
      return "/mi-cuenta";
  }
}

/**
 * Middleware para layouts protegidos: exige sesión y uno de los roles indicados.
 * Deja el usuario disponible con `context.get(contextoUsuario)`.
 */
export function requerirRol(...roles: Rol[]): MiddlewareFunction<Response> {
  return async ({ request, context }) => {
    const usuario = await obtenerUsuario(request, context);
    if (!usuario) {
      const url = new URL(request.url);
      throw redirect(`/ingresar?redirigir=${encodeURIComponent(url.pathname + url.search)}`);
    }
    if (!roles.includes(usuario.role)) {
      throw redirect(inicioPorRol(usuario.role));
    }
    context.set(contextoUsuario, usuario);
  };
}
