import { contextoApp } from "~/lib/contexto";
import { enviarTextoWhatsapp, firmaMetaValida, secretosAvisos } from "~/modules/avisos/envio.server";
import { procesarRespuestaWhatsapp } from "~/modules/avisos/respuestas.server";
import type { Route } from "./+types/api.whatsapp";

/** Verificación del webhook al configurarlo en Meta. */
export function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(contextoApp);
  const url = new URL(request.url);
  const tokenEsperado = secretosAvisos(env).WHATSAPP_VERIFY_TOKEN;
  if (tokenEsperado && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === tokenEsperado) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Prohibido", { status: 403 });
}

type MensajeEntrante = {
  from: string;
  type: string;
  button?: { payload?: string };
  interactive?: { button_reply?: { id?: string } };
};

/** Mensajes entrantes: respuestas a los botones del recordatorio. */
export async function action({ request, context }: Route.ActionArgs) {
  const app = context.get(contextoApp);
  const cuerpo = await request.text();
  if (!(await firmaMetaValida(app.env, cuerpo, request.headers.get("x-hub-signature-256")))) {
    return new Response("Firma inválida", { status: 401 });
  }

  const datos = JSON.parse(cuerpo) as { entry?: { changes?: { value?: { messages?: MensajeEntrante[] } }[] }[] };
  const mensajes = datos.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const m of mensajes) {
    const payload = m.button?.payload ?? m.interactive?.button_reply?.id;
    if (!payload) continue; // Mensajes de texto libre: los atiende una persona.
    const respuesta = await procesarRespuestaWhatsapp(app, { telefono: m.from, payload });
    await enviarTextoWhatsapp(app.env, `+${m.from}`, respuesta).catch((e) => console.error("No se pudo responder por WhatsApp", e));
  }
  // Meta reintenta si no recibe 200 rápido.
  return new Response("ok", { status: 200 });
}
