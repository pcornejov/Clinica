import type { ConfigEditable, ConfigGuardada } from "./esquema";

/**
 * Configuración de la clínica. Lo que cambia entre clientes se edita desde
 * Panel → Configuración (Fase 7) y se guarda en la base de datos; estos son
 * los valores iniciales.
 */
export type ConfigClinica = ConfigEditable & {
  /** Idioma de las plantillas de WhatsApp aprobadas en Meta (no es editable). */
  avisos: { idiomaWhatsapp: string };
};

export const CONFIG_POR_DEFECTO: ConfigClinica = {
  nombre: "Centro Médico Demo",
  eslogan: "Atención cercana, agenda simple",
  descripcion:
    "Somos un centro médico con especialistas en distintas áreas. Agenda tu hora en línea en menos de un minuto.",
  direccion: "Av. Ejemplo 1234, Santiago",
  telefono: "+56 2 2345 6789",
  whatsapp: "+56 9 1234 5678",
  email: "contacto@example.com",
  horarioAtencion: "Lunes a viernes de 08:00 a 20:00 · Sábados de 09:00 a 14:00",
  logoUrl: "",
  colorTono: 200,

  modulos: {
    pagoOnline: true,
    whatsapp: true,
    botWhatsapp: true,
    fichaClinica: true,
  },

  reglas: {
    /** Horas mínimas de anticipación para agendar. */
    anticipacionMinimaHoras: 2,
    /** Días hacia adelante que se muestran en la agenda pública. */
    diasAgendaVisible: 30,
    /** Horas mínimas para cancelar con devolución. */
    cancelacionConDevolucionHoras: 24,
    /** Minutos que se retiene una hora mientras se paga online. */
    reservaPagoMinutos: 15,
    /** Horas antes de la cita en que se envía el recordatorio. */
    recordatorioHorasAntes: 24,
  },

  avisos: {
    idiomaWhatsapp: "es",
  },
};

/**
 * Configuración vigente. Es una sola por instalación, así que vive como un
 * objeto compartido: el servidor lo refresca desde la base de datos
 * (`cargarConfig`) y el navegador lo hidrata con los datos del loader raíz.
 * Se modifica solo con `aplicarConfig`.
 */
export const clinica: ConfigClinica = structuredClone(CONFIG_POR_DEFECTO);

/** "correo y WhatsApp" o solo "correo", según el módulo activo. */
export function canalesAviso(): string {
  return clinica.modulos.whatsapp ? "correo y WhatsApp" : "correo";
}

/** Deja vigente la configuración por defecto más lo guardado (que puede estar incompleto). */
export function aplicarConfig(guardada: ConfigGuardada = {}): void {
  const base = structuredClone(CONFIG_POR_DEFECTO);
  Object.assign(clinica, base, guardada, {
    modulos: { ...base.modulos, ...guardada.modulos },
    reglas: { ...base.reglas, ...guardada.reglas },
    avisos: base.avisos,
  });
}
