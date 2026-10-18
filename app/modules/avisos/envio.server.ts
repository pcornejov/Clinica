import { clinica } from "~/config/clinica";
import type { MensajeWhatsapp } from "./plantillas";

/** Secretos opcionales: si faltan, el canal funciona en modo simulado. */
export type SecretosAvisos = {
  RESEND_API_KEY?: string;
  EMAIL_REMITENTE?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_API_VERSION?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
};

export function secretosAvisos(env: Env): SecretosAvisos {
  return env as unknown as SecretosAvisos;
}

export type ResultadoEnvio = { id: string; simulado: boolean };

export function emailSimulado(env: Env): boolean {
  return !secretosAvisos(env).RESEND_API_KEY;
}

export function whatsappSimulado(env: Env): boolean {
  const s = secretosAvisos(env);
  return !s.WHATSAPP_TOKEN || !s.WHATSAPP_PHONE_NUMBER_ID;
}

export async function enviarEmail(
  env: Env,
  correo: { para: string; asunto: string; html: string; texto: string },
): Promise<ResultadoEnvio> {
  const s = secretosAvisos(env);
  if (!s.RESEND_API_KEY) return { id: "simulado", simulado: true };
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${s.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: s.EMAIL_REMITENTE || `${clinica.nombre} <onboarding@resend.dev>`,
      to: [correo.para],
      subject: correo.asunto,
      html: correo.html,
      text: correo.texto,
    }),
  });
  const cuerpo = (await respuesta.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!respuesta.ok || !cuerpo.id) throw new Error(`Resend ${respuesta.status}: ${cuerpo.message ?? "error"}`);
  return { id: cuerpo.id, simulado: false };
}

/** "+56912345678" → "56912345678" (formato que pide la API de WhatsApp). */
function numeroWhatsapp(e164: string): string {
  return e164.replace(/\D/g, "");
}

async function llamarWhatsapp(env: Env, cuerpo: Record<string, unknown>): Promise<ResultadoEnvio> {
  const s = secretosAvisos(env);
  if (!s.WHATSAPP_TOKEN || !s.WHATSAPP_PHONE_NUMBER_ID) return { id: "simulado", simulado: true };
  const version = s.WHATSAPP_API_VERSION || "v23.0";
  const respuesta = await fetch(`https://graph.facebook.com/${version}/${s.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
  });
  const r = (await respuesta.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!respuesta.ok || !r.messages?.[0]) throw new Error(`WhatsApp ${respuesta.status}: ${r.error?.message ?? "error"}`);
  return { id: r.messages[0].id, simulado: false };
}

/** Mensaje con plantilla aprobada (obligatorio cuando la clínica escribe primero). */
export function enviarPlantillaWhatsapp(env: Env, para: string, mensaje: MensajeWhatsapp): Promise<ResultadoEnvio> {
  return llamarWhatsapp(env, {
    to: numeroWhatsapp(para),
    type: "template",
    template: {
      name: mensaje.plantilla,
      language: { code: clinica.avisos.idiomaWhatsapp },
      components: [
        { type: "body", parameters: mensaje.parametros.map((text) => ({ type: "text", text })) },
        ...(mensaje.botones ?? []).map((b, index) => ({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [{ type: "payload", payload: b.payload }],
        })),
      ],
    },
  });
}

/** Mensaje ya armado (texto o interactivo), dentro de la ventana de 24 h de una conversación. */
export function enviarCargaWhatsapp(env: Env, para: string, carga: Record<string, unknown>): Promise<ResultadoEnvio> {
  return llamarWhatsapp(env, { to: numeroWhatsapp(para), ...carga });
}

/** Texto libre: solo permitido dentro de las 24 h siguientes a un mensaje del paciente. */
export function enviarTextoWhatsapp(env: Env, para: string, texto: string): Promise<ResultadoEnvio> {
  return llamarWhatsapp(env, { to: numeroWhatsapp(para), type: "text", text: { body: texto } });
}

/** Verifica la firma X-Hub-Signature-256 de los webhooks de Meta. */
export async function firmaMetaValida(env: Env, cuerpo: string, firma: string | null): Promise<boolean> {
  const secreto = secretosAvisos(env).WHATSAPP_APP_SECRET;
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo)));
  const esperada = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const recibida = firma.slice(7);
  if (esperada.length !== recibida.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperada.length; i++) diferencia |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return diferencia === 0;
}
