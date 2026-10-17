import { contextoApp } from "~/lib/contexto";
import type { Route } from "./+types/api.auth";

// Endpoints de Better Auth (/api/auth/*), usados por clientes que no pasan por
// las acciones de React Router (p. ej. inicio de sesión sin contraseña, Fase 2).
export async function loader({ request, context }: Route.LoaderArgs) {
  return context.get(contextoApp).auth.handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  return context.get(contextoApp).auth.handler(request);
}
