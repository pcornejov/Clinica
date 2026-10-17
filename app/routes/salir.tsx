import { redirect } from "react-router";
import { contextoApp } from "~/lib/contexto";
import type { Route } from "./+types/salir";

export async function action({ request, context }: Route.ActionArgs) {
  const { auth } = context.get(contextoApp);
  const respuesta = await auth.api.signOut({ headers: request.headers, asResponse: true });
  const headers = new Headers();
  for (const cookie of respuesta.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return redirect("/", { headers });
}

export function loader() {
  return redirect("/");
}
