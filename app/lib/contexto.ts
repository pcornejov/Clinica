import { createContext } from "react-router";
import type { Db } from "~/db/client";
import type { Auth, BuzonDemo, Rol } from "./auth.server";

export type ContextoApp = {
  env: Env;
  ctx: ExecutionContext;
  db: Db;
  auth: Auth;
  buzonDemo: BuzonDemo;
  /** Tareas en segundo plano (envío de avisos) que deben terminar antes de cerrar la base. */
  tareas: Promise<unknown>[];
};

/** Ejecuta una tarea después de responder (p. ej. enviar los avisos de una reserva). */
export function enSegundoPlano(app: ContextoApp, tarea: Promise<unknown>) {
  const segura = tarea.catch((error) => console.error("Tarea en segundo plano falló", error));
  app.tareas.push(segura);
  app.ctx.waitUntil(segura);
}

/** Recursos por petición (base de datos, auth, variables de entorno). */
export const contextoApp = createContext<ContextoApp>();

export type UsuarioSesion = {
  id: string;
  name: string;
  email: string;
  role: Rol;
};

/** Usuario autenticado; lo establece el middleware `requerirRol`. */
export const contextoUsuario = createContext<UsuarioSesion>();
