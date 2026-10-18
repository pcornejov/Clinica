import { contextoApp } from "~/lib/contexto";
import { enviarTextoWhatsapp, firmaMetaValida, secretosAvisos } from "~/modules/avisos/envio.server";
import { procesarRespuestaWhatsapp } from "~/modules/avisos/respuestas.server";
import { PREFIJO_BOT } from "~/modules/whatsapp/bot";
import { atenderMensaje, botActivo, marcarMensajeAtendido } from "~/modules/whatsapp/bot.server";
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
  id?: string;
  from: string;
  type: string;
  text?: { body?: string };
  button?: { payload?: string };
  interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } };
};

/**
 * Mensajes entrantes. Los botones de los recordatorios (plantillas) los
 * procesa `procesarRespuestaWhatsapp`; todo lo demás lo atiende el bot.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const app = context.get(contextoApp);
  const cuerpo = await request.text();
  if (!(await firmaMetaValida(app.env, cuerpo, request.headers.get("x-hub-signature-256")))) {
    return new Response("Firma inválida", { status: 401 });
  }

  const datos = JSON.parse(cuerpo) as { entry?: { changes?: { value?: { messages?: MensajeEntrante[] } }[] }[] };
  const mensajes = datos.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const m of mensajes) {
    const opcion = m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id;
    const payload = m.button?.payload ?? (opcion && !opcion.startsWith(PREFIJO_BOT) ? opcion : undefined);
    if (payload) {
      const respuesta = await procesarRespuestaWhatsapp(app, { telefono: m.from, payload });
      await enviarTextoWhatsapp(app.env, `+${m.from}`, respuesta).catch((e) => console.error("No se pudo responder por WhatsApp", e));
      continue;
    }
    if (!botActivo()) continue;
    // Meta reintenta los webhooks: cada mensaje se atiende una sola vez.
    if (m.id && !(await marcarMensajeAtendido(app.db, m.id))) continue;
    await atenderMensaje(app, { telefono: m.from, texto: m.text?.body, opcion });
  }
  // Meta reintenta si no recibe 200 rápido.
  return new Response("ok", { status: 200 });
}
