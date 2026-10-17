import { Panel } from "~/components/panel";
import { contextoUsuario } from "~/lib/contexto";
import { requerirRol } from "~/lib/sesion.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [requerirRol("medico")];

export function loader({ context }: Route.LoaderArgs) {
  return { usuario: context.get(contextoUsuario) };
}

export default function LayoutMedico({ loaderData }: Route.ComponentProps) {
  return (
    <Panel
      usuario={loaderData.usuario}
      enlaces={[
        { a: "/medico", texto: "Mi agenda" },
        { a: "/medico/pacientes", texto: "Pacientes" },
      ]}
    />
  );
}
