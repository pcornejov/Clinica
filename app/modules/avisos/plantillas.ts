/**
 * Textos de los avisos. Los mensajes llevan lo mínimo (profesional,
 * especialidad, fecha y hora): nunca diagnósticos ni información clínica.
 *
 * Las plantillas de WhatsApp deben crearse y aprobarse en Meta con estos
 * mismos nombres y textos (ver docs/WHATSAPP.md).
 */

export type TipoAviso = "confirmacion" | "recordatorio_24h" | "recordatorio_2h" | "reagendamiento" | "cancelacion" | "lista_espera";

export type DatosAviso = {
  clinica: { nombre: string; direccion: string; telefono: string };
  /** Primer nombre de quien recibe el aviso. */
  nombre: string;
  /** Si la cita es de un dependiente, su nombre (el aviso va al tutor). */
  paraQuien?: string | null;
  especialidad: string;
  medico: string;
  fechaHora: string;
  /** Link para ver, cambiar o anular la cita. */
  linkGestion: string;
  /** Link para agendar (cancelaciones y lista de espera). */
  linkAgendar: string;
  /** Token de gestión, usado en los botones de respuesta de WhatsApp. */
  tokenGestion: string;
};

/** Plantillas de WhatsApp: nombre en Meta y texto con variables {{n}}. */
export const PLANTILLAS_WHATSAPP = {
  // Meta no admite cuerpos que terminen en una variable: por eso cierran con "Gracias.".
  cita_confirmada: "Hola {{1}}, tu hora de {{2}} con {{3}} quedó reservada para el {{4}}. Para ver, cambiar o anular tu hora: {{5}} Gracias.",
  cita_recordatorio: "Hola {{1}}, te recordamos tu hora de {{2}} con {{3}} el {{4}}. ¿Asistirás? Responde con uno de los botones.",
  cita_reagendada: "Hola {{1}}, tu hora de {{2}} con {{3}} cambió al {{4}}. Para ver o gestionar tu hora: {{5}} Gracias.",
  cita_anulada: "Hola {{1}}, tu hora de {{2}} del {{3}} fue anulada. Si quieres agendar una nueva hora: {{4}} Gracias.",
  // Sin aprobar: Meta la clasifica como Marketing. La lista de espera avisa solo por correo.
  hora_liberada: "Hola {{1}}, se liberó la hora de {{2}} con {{3}} el {{4}} que esperabas en tu lista de espera. Para reservarla ingresa aquí: {{5}} Gracias.",
} as const;

export type NombrePlantilla = keyof typeof PLANTILLAS_WHATSAPP;

export type MensajeWhatsapp = {
  plantilla: NombrePlantilla;
  parametros: string[];
  /** Botones de respuesta rápida (solo el recordatorio). */
  botones?: { texto: string; payload: string }[];
};

export type Aviso = {
  email: { asunto: string; texto: string; html: string };
  whatsapp: MensajeWhatsapp;
};

/** Reemplaza {{n}} por los parámetros (para mostrar el mensaje en el panel). */
export function textoWhatsapp(m: MensajeWhatsapp): string {
  const texto = PLANTILLAS_WHATSAPP[m.plantilla].replace(/\{\{(\d+)\}\}/g, (_, n) => m.parametros[Number(n) - 1] ?? "");
  return m.botones ? `${texto}\n[${m.botones.map((b) => b.texto).join("] [")}]` : texto;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function html(d: DatosAviso, titulo: string, parrafos: string[], boton?: { texto: string; url: string }): string {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapar(p)}</p>`).join("");
  const accion = boton
    ? `<p style="margin:24px 0"><a href="${escapar(boton.url)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapar(boton.texto)}</a></p>`
    : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
<p style="margin:0 0 24px;font-weight:700;color:#0f766e">${escapar(d.clinica.nombre)}</p>
<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escapar(titulo)}</h1>${cuerpo}${accion}
</div>
<p style="margin:24px 0 0;font-size:12px;color:#64748b">${escapar(d.clinica.direccion)} · ${escapar(d.clinica.telefono)}</p>
</div></body></html>`;
}

function texto(d: DatosAviso, titulo: string, parrafos: string[], boton?: { texto: string; url: string }): string {
  return [titulo, "", ...parrafos, ...(boton ? ["", `${boton.texto}: ${boton.url}`] : []), "", d.clinica.nombre, d.clinica.direccion].join("\n");
}

export function construirAviso(tipo: TipoAviso, d: DatosAviso): Aviso {
  // "Pediatría (para Tomás)" cuando el aviso va al tutor de un dependiente.
  const especialidad = d.paraQuien ? `${d.especialidad} (para ${d.paraQuien})` : d.especialidad;
  const detalle = `${especialidad} con ${d.medico}`;
  const gestionar = { texto: "Ver, cambiar o anular mi hora", url: d.linkGestion };

  const armar = (asunto: string, titulo: string, parrafos: string[], boton: { texto: string; url: string } | undefined, whatsapp: MensajeWhatsapp): Aviso => ({
    email: { asunto, texto: texto(d, titulo, parrafos, boton), html: html(d, titulo, parrafos, boton) },
    whatsapp,
  });

  switch (tipo) {
    case "confirmacion":
      return armar(
        `Hora reservada: ${d.fechaHora}`,
        `Hola ${d.nombre}, tu hora quedó reservada`,
        [`${detalle}.`, `${d.fechaHora}.`, `Dirección: ${d.clinica.direccion}. Llega 15 minutos antes con tu cédula de identidad.`],
        gestionar,
        { plantilla: "cita_confirmada", parametros: [d.nombre, especialidad, d.medico, d.fechaHora, d.linkGestion] },
      );
    case "recordatorio_24h":
    case "recordatorio_2h":
      return armar(
        `Recordatorio: ${d.fechaHora}`,
        `Hola ${d.nombre}, te recordamos tu hora`,
        [`${detalle}.`, `${d.fechaHora}.`, `Dirección: ${d.clinica.direccion}.`, "Si no puedes asistir, anúlala para que otra persona pueda usarla."],
        gestionar,
        {
          plantilla: "cita_recordatorio",
          parametros: [d.nombre, especialidad, d.medico, d.fechaHora],
          botones: [
            { texto: "Confirmar asistencia", payload: `CONFIRMAR:${d.tokenGestion}` },
            { texto: "Anular hora", payload: `ANULAR:${d.tokenGestion}` },
          ],
        },
      );
    case "reagendamiento":
      return armar(
        `Tu hora cambió: ${d.fechaHora}`,
        `Hola ${d.nombre}, tu hora cambió`,
        [`${detalle}.`, `Nueva fecha: ${d.fechaHora}.`],
        gestionar,
        { plantilla: "cita_reagendada", parametros: [d.nombre, especialidad, d.medico, d.fechaHora, d.linkGestion] },
      );
    case "cancelacion":
      return armar(
        "Tu hora fue anulada",
        `Hola ${d.nombre}, tu hora fue anulada`,
        [`${detalle}, ${d.fechaHora}.`, "Si quieres, puedes agendar una nueva hora."],
        { texto: "Agendar una nueva hora", url: d.linkAgendar },
        { plantilla: "cita_anulada", parametros: [d.nombre, especialidad, d.fechaHora, d.linkAgendar] },
      );
    case "lista_espera":
      return armar(
        `Se liberó una hora de ${d.especialidad}`,
        `Hola ${d.nombre}, se liberó una hora`,
        [`${detalle}.`, `${d.fechaHora}.`, "Estabas en nuestra lista de espera. Si te sirve, resérvala antes de que alguien más la tome."],
        { texto: "Reservar esta hora", url: d.linkAgendar },
        { plantilla: "hora_liberada", parametros: [d.nombre, especialidad, d.medico, d.fechaHora, d.linkAgendar] },
      );
  }
}
