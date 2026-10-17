/**
 * Configuración de la clínica. Todo lo que cambia entre clientes debería
 * vivir aquí (y más adelante en la base de datos, Fase 7), no en el código.
 */
export const clinica = {
  nombre: "Centro Médico Demo",
  eslogan: "Atención cercana, agenda simple",
  descripcion:
    "Somos un centro médico con especialistas en distintas áreas. Agenda tu hora en línea en menos de un minuto.",
  direccion: "Av. Ejemplo 1234, Santiago",
  telefono: "+56 2 2345 6789",
  whatsapp: "+56 9 1234 5678",
  email: "contacto@example.com",
  horarioAtencion: "Lunes a viernes de 08:00 a 20:00 · Sábados de 09:00 a 14:00",

  modulos: {
    pagoOnline: true,
    whatsapp: true,
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
    /** Idioma de las plantillas de WhatsApp aprobadas en Meta. */
    idiomaWhatsapp: "es",
  },
} as const;
