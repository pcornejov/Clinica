import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const creadoEn = () =>
  timestamp("creado_en", { withTimezone: true }).notNull().defaultNow();
const actualizadoEn = () =>
  timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── Autenticación (tablas requeridas por Better Auth) ──────────────────────

export const rolUsuario = pgEnum("rol_usuario", [
  "admin",
  "recepcion",
  "medico",
  "paciente",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: rolUsuario("role").notNull().default("paciente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ─── Personal y especialidades ──────────────────────────────────────────────

export const especialidades = pgTable("especialidades", {
  id: id(),
  nombre: text("nombre").notNull(),
  slug: text("slug").notNull().unique(),
  descripcion: text("descripcion"),
  duracionMinutos: smallint("duracion_minutos").notNull().default(30),
  /** Precio de la consulta en CLP. */
  precio: integer("precio").notNull(),
  activa: boolean("activa").notNull().default(true),
  creadoEn: creadoEn(),
});

export const medicos = pgTable("medicos", {
  id: id(),
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  rut: text("rut").notNull().unique(),
  nombres: text("nombres").notNull(),
  apellidos: text("apellidos").notNull(),
  email: text("email").notNull(),
  telefono: text("telefono"),
  /** N° de registro en la Superintendencia de Salud. */
  registroSis: text("registro_sis"),
  biografia: text("biografia"),
  /** Si atiende con bono Fonasa (Modalidad Libre Elección). */
  atiendeFonasa: boolean("atiende_fonasa").notNull().default(true),
  fotoUrl: text("foto_url"),
  activo: boolean("activo").notNull().default(true),
  creadoEn: creadoEn(),
  actualizadoEn: actualizadoEn(),
});

export const medicoEspecialidades = pgTable(
  "medico_especialidades",
  {
    medicoId: uuid("medico_id")
      .notNull()
      .references(() => medicos.id, { onDelete: "cascade" }),
    especialidadId: uuid("especialidad_id")
      .notNull()
      .references(() => especialidades.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.medicoId, t.especialidadId] })],
);

/** Bloque recurrente semanal de atención (ej. lunes 09:00–13:00, cada 30 min). */
export const horariosMedico = pgTable(
  "horarios_medico",
  {
    id: id(),
    medicoId: uuid("medico_id")
      .notNull()
      .references(() => medicos.id, { onDelete: "cascade" }),
    especialidadId: uuid("especialidad_id").references(() => especialidades.id),
    /** 0 = domingo … 6 = sábado. */
    diaSemana: smallint("dia_semana").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFin: time("hora_fin").notNull(),
    duracionMinutos: smallint("duracion_minutos").notNull().default(30),
    vigenteDesde: date("vigente_desde").notNull().defaultNow(),
    vigenteHasta: date("vigente_hasta"),
  },
  (t) => [index("horarios_medico_idx").on(t.medicoId, t.diaSemana)],
);

/** Vacaciones, licencias o bloqueos puntuales de la agenda. */
export const bloqueosAgenda = pgTable(
  "bloqueos_agenda",
  {
    id: id(),
    medicoId: uuid("medico_id")
      .notNull()
      .references(() => medicos.id, { onDelete: "cascade" }),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fin: timestamp("fin", { withTimezone: true }).notNull(),
    motivo: text("motivo"),
    creadoEn: creadoEn(),
  },
  (t) => [index("bloqueos_medico_idx").on(t.medicoId, t.inicio)],
);

// ─── Pacientes y citas ──────────────────────────────────────────────────────

export const prevision = pgEnum("prevision", ["fonasa", "isapre", "particular", "otra"]);

export const pacientes = pgTable("pacientes", {
  id: id(),
  /**
   * Responsable de un paciente dependiente (hijo/a u otra carga familiar).
   * Las citas del dependiente se gestionan desde la cuenta del tutor y los
   * avisos van a su correo y teléfono.
   */
  tutorId: uuid("tutor_id").references((): AnyPgColumn => pacientes.id, {
    onDelete: "set null",
  }),
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  rut: text("rut").notNull().unique(),
  nombres: text("nombres").notNull(),
  apellidos: text("apellidos").notNull(),
  fechaNacimiento: date("fecha_nacimiento"),
  sexo: text("sexo"),
  email: text("email"),
  telefono: text("telefono"),
  prevision: prevision("prevision"),
  isapre: text("isapre"),
  direccion: text("direccion"),
  contactoEmergenciaNombre: text("contacto_emergencia_nombre"),
  contactoEmergenciaTelefono: text("contacto_emergencia_telefono"),
  /** Cuándo aceptó recibir avisos por correo y WhatsApp (Ley 21.719). */
  consentimientoContactoEn: timestamp("consentimiento_contacto_en", { withTimezone: true }),
  creadoEn: creadoEn(),
  actualizadoEn: actualizadoEn(),
});

export const estadoCita = pgEnum("estado_cita", [
  "pendiente_pago",
  "agendada",
  "confirmada",
  "atendida",
  "no_asistio",
  "cancelada",
]);
export const canalCita = pgEnum("canal_cita", ["web", "whatsapp", "recepcion"]);
export const modalidadPago = pgEnum("modalidad_pago", ["online", "clinica"]);

export const citas = pgTable(
  "citas",
  {
    id: id(),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    medicoId: uuid("medico_id")
      .notNull()
      .references(() => medicos.id, { onDelete: "restrict" }),
    especialidadId: uuid("especialidad_id")
      .notNull()
      .references(() => especialidades.id, { onDelete: "restrict" }),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fin: timestamp("fin", { withTimezone: true }).notNull(),
    estado: estadoCita("estado").notNull().default("agendada"),
    canal: canalCita("canal").notNull().default("web"),
    modalidadPago: modalidadPago("modalidad_pago").notNull().default("clinica"),
    /** Precio en CLP al momento de agendar. */
    precio: integer("precio").notNull(),
    /** Agendada por recepción fuera de los cupos normales. */
    sobrecupo: boolean("sobrecupo").notNull().default(false),
    motivoConsulta: text("motivo_consulta"),
    /** Marcada cuando los datos de contacto no coinciden con los registrados. */
    requiereRevision: boolean("requiere_revision").notNull().default(false),
    /** Hasta cuándo se retiene la hora mientras se espera el pago online. */
    reservaExpiraEn: timestamp("reserva_expira_en", { withTimezone: true }),
    canceladaEn: timestamp("cancelada_en", { withTimezone: true }),
    motivoCancelacion: text("motivo_cancelacion"),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
    // La restricción que impide citas superpuestas para un mismo médico
    // (EXCLUDE USING gist, salvo sobrecupos) está en drizzle/0001_restricciones.sql.
  },
  (t) => [
    index("citas_medico_inicio_idx").on(t.medicoId, t.inicio),
    index("citas_paciente_idx").on(t.pacienteId),
    index("citas_pendiente_pago_idx")
      .on(t.reservaExpiraEn)
      .where(sql`${t.estado} = 'pendiente_pago'`),
  ],
);

/** Online (webpay, mercadopago) o registrado en la caja de la clínica. */
export const medioPago = pgEnum("medio_pago", [
  "webpay",
  "mercadopago",
  "efectivo",
  "tarjeta",
  "transferencia",
  "bono_fonasa",
  "bono_isapre",
  "convenio",
]);
export const estadoPago = pgEnum("estado_pago", [
  "pendiente",
  "pagado",
  "rechazado",
  "anulado",
  "reembolsado",
]);

export const pagos = pgTable(
  "pagos",
  {
    id: id(),
    citaId: uuid("cita_id")
      .notNull()
      .references(() => citas.id, { onDelete: "restrict" }),
    medio: medioPago("medio").notNull(),
    estado: estadoPago("estado").notNull().default("pendiente"),
    monto: integer("monto").notNull(),
    /** Token de Transbank / id de Mercado Pago, o folio del bono Fonasa/Isapre. */
    referenciaExterna: text("referencia_externa"),
    /** Usuario de caja que registró el pago presencial. */
    registradoPor: text("registrado_por").references(() => user.id),
    /** Folio del bono, últimos dígitos de la tarjeta, código de autorización, etc. */
    detalle: jsonb("detalle").$type<Record<string, unknown>>(),
    pagadoEn: timestamp("pagado_en", { withTimezone: true }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    index("pagos_cita_idx").on(t.citaId),
    index("pagos_pagado_en_idx").on(t.pagadoEn),
    uniqueIndex("pagos_referencia_idx").on(t.medio, t.referenciaExterna),
  ],
);

export const estadoListaEspera = pgEnum("estado_lista_espera", [
  "activa",
  "notificada",
  "agendada",
  "cancelada",
]);

/** Pacientes esperando que se libere una hora en una especialidad o con un médico. */
export const listaEspera = pgTable(
  "lista_espera",
  {
    id: id(),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "cascade" }),
    especialidadId: uuid("especialidad_id")
      .notNull()
      .references(() => especialidades.id, { onDelete: "cascade" }),
    /** Opcional: solo con este médico. */
    medicoId: uuid("medico_id").references(() => medicos.id, { onDelete: "cascade" }),
    /** Rango de fechas en que le sirve una hora. */
    desde: date("desde").notNull(),
    hasta: date("hasta").notNull(),
    estado: estadoListaEspera("estado").notNull().default("activa"),
    notificadaEn: timestamp("notificada_en", { withTimezone: true }),
    citaId: uuid("cita_id").references(() => citas.id, { onDelete: "set null" }),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("lista_espera_activa_idx")
      .on(t.especialidadId, t.creadoEn)
      .where(sql`${t.estado} = 'activa'`),
  ],
);

export const canalNotificacion = pgEnum("canal_notificacion", ["email", "whatsapp"]);
export const tipoNotificacion = pgEnum("tipo_notificacion", [
  "confirmacion",
  "recordatorio_24h",
  "recordatorio_2h",
  "cancelacion",
  "reagendamiento",
  "lista_espera",
]);
export const estadoNotificacion = pgEnum("estado_notificacion", [
  "pendiente",
  "procesando",
  "enviada",
  "fallida",
  "omitida",
]);

export const notificaciones = pgTable(
  "notificaciones",
  {
    id: id(),
    citaId: uuid("cita_id").references(() => citas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "cascade" }),
    canal: canalNotificacion("canal").notNull(),
    tipo: tipoNotificacion("tipo").notNull(),
    estado: estadoNotificacion("estado").notNull().default("pendiente"),
    programadaPara: timestamp("programada_para", { withTimezone: true }).notNull(),
    enviadaEn: timestamp("enviada_en", { withTimezone: true }),
    intentos: smallint("intentos").notNull().default(0),
    /** Cuándo la tomó un proceso de envío (evita envíos duplicados). */
    bloqueadaEn: timestamp("bloqueada_en", { withTimezone: true }),
    /** Correo o teléfono al que se envió, y el contenido, para revisarlo en el panel. */
    destino: text("destino"),
    asunto: text("asunto"),
    cuerpo: text("cuerpo"),
    error: text("error"),
    /** Id del mensaje en Resend / WhatsApp, o "simulado". */
    idExterno: text("id_externo"),
    creadoEn: creadoEn(),
  },
  (t) => [
    // Evita enviar dos veces el mismo aviso de una cita.
    uniqueIndex("notificaciones_unica_idx").on(t.citaId, t.canal, t.tipo),
    index("notificaciones_pendientes_idx")
      .on(t.programadaPara)
      .where(sql`${t.estado} = 'pendiente'`),
  ],
);

// ─── Ficha clínica ──────────────────────────────────────────────────────────

/** Antecedentes permanentes del paciente (uno por paciente). */
export const fichasClinicas = pgTable("fichas_clinicas", {
  id: id(),
  pacienteId: uuid("paciente_id")
    .notNull()
    .unique()
    .references(() => pacientes.id, { onDelete: "restrict" }),
  grupoSanguineo: text("grupo_sanguineo"),
  alergias: text("alergias"),
  enfermedadesCronicas: text("enfermedades_cronicas"),
  medicamentosHabituales: text("medicamentos_habituales"),
  antecedentesQuirurgicos: text("antecedentes_quirurgicos"),
  antecedentesFamiliares: text("antecedentes_familiares"),
  habitos: text("habitos"),
  observaciones: text("observaciones"),
  actualizadoPor: text("actualizado_por").references(() => user.id),
  creadoEn: creadoEn(),
  actualizadoEn: actualizadoEn(),
});

export const estadoAtencion = pgEnum("estado_atencion", ["borrador", "firmada"]);

export type SignosVitales = {
  presionSistolica?: number;
  presionDiastolica?: number;
  frecuenciaCardiaca?: number;
  frecuenciaRespiratoria?: number;
  temperatura?: number;
  saturacion?: number;
  pesoKg?: number;
  tallaCm?: number;
};

/**
 * Registro de una consulta (evolución). Una vez firmada no se modifica:
 * las correcciones se registran como una nueva atención con `corrigeA`.
 */
export const atenciones = pgTable(
  "atenciones",
  {
    id: id(),
    fichaId: uuid("ficha_id")
      .notNull()
      .references(() => fichasClinicas.id, { onDelete: "restrict" }),
    medicoId: uuid("medico_id")
      .notNull()
      .references(() => medicos.id, { onDelete: "restrict" }),
    citaId: uuid("cita_id")
      .unique()
      .references(() => citas.id, { onDelete: "set null" }),
    especialidadId: uuid("especialidad_id").references(() => especialidades.id),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
    motivoConsulta: text("motivo_consulta"),
    anamnesis: text("anamnesis"),
    examenFisico: text("examen_fisico"),
    signosVitales: jsonb("signos_vitales").$type<SignosVitales>(),
    indicaciones: text("indicaciones"),
    plan: text("plan"),
    /** Campos adicionales por especialidad (para adaptar la ficha a futuro). */
    camposExtra: jsonb("campos_extra").$type<Record<string, unknown>>(),
    estado: estadoAtencion("estado").notNull().default("borrador"),
    firmadaEn: timestamp("firmada_en", { withTimezone: true }),
    corrigeA: uuid("corrige_a"),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [index("atenciones_ficha_fecha_idx").on(t.fichaId, t.fecha)],
);

export const tipoDiagnostico = pgEnum("tipo_diagnostico", ["principal", "secundario"]);

export const diagnosticos = pgTable(
  "diagnosticos",
  {
    id: id(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "cascade" }),
    /** Código CIE-10, ej. "J06.9". */
    codigoCie10: text("codigo_cie10"),
    descripcion: text("descripcion").notNull(),
    tipo: tipoDiagnostico("tipo").notNull().default("principal"),
  },
  (t) => [index("diagnosticos_atencion_idx").on(t.atencionId)],
);

export const adjuntos = pgTable(
  "adjuntos",
  {
    id: id(),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    atencionId: uuid("atencion_id").references(() => atenciones.id, {
      onDelete: "set null",
    }),
    nombreArchivo: text("nombre_archivo").notNull(),
    /** Clave del objeto en Cloudflare R2. */
    claveR2: text("clave_r2").notNull(),
    tipoMime: text("tipo_mime").notNull(),
    tamanoBytes: integer("tamano_bytes").notNull(),
    subidoPor: text("subido_por").references(() => user.id),
    creadoEn: creadoEn(),
  },
  (t) => [index("adjuntos_paciente_idx").on(t.pacienteId)],
);

/**
 * Catálogo CIE-10 (OMS). Se carga un catálogo básico con los datos demo; el
 * completo se importa desde el archivo del DEIS-MINSAL (scripts/importar-cie10.ts).
 */
export const cie10 = pgTable(
  "cie10",
  {
    codigo: text("codigo").primaryKey(),
    descripcion: text("descripcion").notNull(),
    /** Código y descripción en minúsculas y sin tildes, para buscar. */
    busqueda: text("busqueda").notNull(),
  },
  (t) => [index("cie10_busqueda_idx").on(t.busqueda)],
);

// ─── Auditoría ──────────────────────────────────────────────────────────────

/** Quién vio o modificó qué y cuándo (exigido para fichas clínicas). */
export const auditoria = pgTable(
  "auditoria",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: text("entidad_id"),
    detalle: jsonb("detalle"),
    ip: text("ip"),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("auditoria_entidad_idx").on(t.entidad, t.entidadId),
    index("auditoria_user_idx").on(t.userId, t.creadoEn),
  ],
);

// ─── Tipos derivados ────────────────────────────────────────────────────────

export type RolUsuario = (typeof rolUsuario.enumValues)[number];
export type EstadoCita = (typeof estadoCita.enumValues)[number];
