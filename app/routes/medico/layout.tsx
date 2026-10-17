import { redirect } from "react-router";
import { Panel } from "~/components/panel";
import { clinica } from "~/config/clinica";
import { contextoUsuario } from "~/lib/contexto";
import { requerirRol } from "~/lib/sesion.server";
import type { Route } from "./+types/layout";

/** Con el módulo de ficha clínica desactivado, el médico solo ve su agenda. */
const soloAgendaSinFicha: Route.MiddlewareFunction = ({ request }) => {
  // En las navegaciones desde el navegador la ruta llega como "/medico.data".
  const ruta = new URL(request.url).pathname.replace(/\.data$/, "").replace(/\/$/, "");
  if (!clinica.modulos.fichaClinica && ruta !== "/medico") throw redirect("/medico");
};

export const middleware: Route.MiddlewareFunction[] = [requerirRol("medico"), soloAgendaSinFicha];

export function loader({ context }: Route.LoaderArgs) {
  return { usuario: context.get(contextoUsuario), fichaClinica: clinica.modulos.fichaClinica };
}

export default function LayoutMedico({ loaderData }: Route.ComponentProps) {
  return (
    <Panel
      usuario={loaderData.usuario}
      enlaces={[
        { a: "/medico", texto: "Mi agenda" },
        ...(loaderData.fichaClinica ? [{ a: "/medico/pacientes", texto: "Pacientes" }] : []),
      ]}
    />
  );
}
