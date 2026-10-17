import { createContext } from "react-router";
import type { Db } from "~/db/client";
import type { Auth, Rol } from "./auth.server";

export type ContextoApp = {
  env: Env;
  ctx: ExecutionContext;
  db: Db;
  auth: Auth;
};

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
