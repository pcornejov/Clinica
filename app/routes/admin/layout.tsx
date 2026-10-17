import { Panel } from "~/components/panel";
import { contextoUsuario } from "~/lib/contexto";
import { requerirRol } from "~/lib/sesion.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("admin", "recepcion")];

export function loader({ context }: Route.LoaderArgs) {
  return { usuario: context.get(contextoUsuario) };
}

export default function LayoutAdmin({ loaderData }: Route.ComponentProps) {
  const { usuario } = loaderData;
  const enlaces = [
    { a: "/admin", texto: "Resumen" },
    { a: "/admin/agenda", texto: "Agenda" },
    { a: "/admin/lista-espera", texto: "Lista de espera" },
  ];
  if (usuario.role === "admin") {
    enlaces.push(
      { a: "/admin/medicos", texto: "Médicos" },
      { a: "/admin/especialidades", texto: "Especialidades" },
      { a: "/admin/usuarios", texto: "Usuarios" },
    );
  }
  return <Panel usuario={usuario} enlaces={enlaces} />;
}
