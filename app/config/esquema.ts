import { z } from "zod";

/**
 * Validación de la configuración editable de la clínica (Fase 7). Se usa al
 * guardar desde el panel y al leer lo guardado en la base de datos.
 */

const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

const entero = (min: number, max: number, mensaje: string) =>
  z.coerce.number(mensaje).int(mensaje).min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`);

export const esquemaMarca = z.object({
  nombre: z.string().trim().min(2, "Ingresa el nombre de la clínica").max(80, "Máximo 80 caracteres"),
  eslogan: texto(120),
  descripcion: texto(400),
  direccion: texto(160),
  telefono: texto(40),
  whatsapp: texto(40),
  email: z.union([z.literal(""), z.email("Correo no válido")]),
  horarioAtencion: texto(200),
  logoUrl: texto(500).refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Debe ser un enlace que empiece con https://"),
  /** Tono (0–360) del color de marca. */
  colorTono: entero(0, 360, "Elige un color"),
});

export const esquemaReglas = z.object({
  anticipacionMinimaHoras: entero(0, 72, "Ingresa las horas de anticipación"),
  diasAgendaVisible: entero(1, 180, "Ingresa los días de agenda"),
  cancelacionConDevolucionHoras: entero(0, 168, "Ingresa las horas para devolución"),
  reservaPagoMinutos: entero(5, 60, "Ingresa los minutos de reserva"),
  recordatorioHorasAntes: entero(2, 168, "Ingresa las horas del recordatorio"),
});

export const esquemaModulos = z.object({
  pagoOnline: z.boolean(),
  whatsapp: z.boolean(),
  fichaClinica: z.boolean(),
});

export type ConfigMarca = z.output<typeof esquemaMarca>;
export type ConfigReglas = z.output<typeof esquemaReglas>;
export type ConfigModulos = z.output<typeof esquemaModulos>;

/** Lo editable desde el panel. */
export type ConfigEditable = ConfigMarca & { modulos: ConfigModulos; reglas: ConfigReglas };

/** Lo guardado puede estar incompleto (p. ej. tras agregar un campo nuevo): se completa con los valores por defecto. */
export const esquemaGuardado = esquemaMarca
  .partial()
  .extend({ modulos: esquemaModulos.partial().optional(), reglas: esquemaReglas.partial().optional() });

export type ConfigGuardada = z.output<typeof esquemaGuardado>;
