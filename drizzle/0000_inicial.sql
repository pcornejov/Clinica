CREATE TYPE "public"."canal_cita" AS ENUM('web', 'whatsapp', 'recepcion');--> statement-breakpoint
CREATE TYPE "public"."canal_notificacion" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."estado_atencion" AS ENUM('borrador', 'firmada');--> statement-breakpoint
CREATE TYPE "public"."estado_cita" AS ENUM('pendiente_pago', 'agendada', 'confirmada', 'atendida', 'no_asistio', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."estado_lista_espera" AS ENUM('activa', 'notificada', 'agendada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."estado_notificacion" AS ENUM('pendiente', 'enviada', 'fallida');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('pendiente', 'pagado', 'rechazado', 'anulado', 'reembolsado');--> statement-breakpoint
CREATE TYPE "public"."medio_pago" AS ENUM('webpay', 'mercadopago', 'efectivo', 'tarjeta', 'transferencia', 'bono_fonasa', 'bono_isapre', 'convenio');--> statement-breakpoint
CREATE TYPE "public"."modalidad_pago" AS ENUM('online', 'clinica');--> statement-breakpoint
CREATE TYPE "public"."prevision" AS ENUM('fonasa', 'isapre', 'particular', 'otra');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('admin', 'recepcion', 'medico', 'paciente');--> statement-breakpoint
CREATE TYPE "public"."tipo_diagnostico" AS ENUM('principal', 'secundario');--> statement-breakpoint
CREATE TYPE "public"."tipo_notificacion" AS ENUM('confirmacion', 'recordatorio_24h', 'recordatorio_2h', 'cancelacion', 'reagendamiento', 'lista_espera');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjuntos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"atencion_id" uuid,
	"nombre_archivo" text NOT NULL,
	"clave_r2" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"subido_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atenciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ficha_id" uuid NOT NULL,
	"medico_id" uuid NOT NULL,
	"cita_id" uuid,
	"especialidad_id" uuid,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"motivo_consulta" text,
	"anamnesis" text,
	"examen_fisico" text,
	"signos_vitales" jsonb,
	"indicaciones" text,
	"plan" text,
	"campos_extra" jsonb,
	"estado" "estado_atencion" DEFAULT 'borrador' NOT NULL,
	"firmada_en" timestamp with time zone,
	"corrige_a" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atenciones_cita_id_unique" UNIQUE("cita_id")
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"detalle" jsonb,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bloqueos_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"medico_id" uuid NOT NULL,
	"especialidad_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"estado" "estado_cita" DEFAULT 'agendada' NOT NULL,
	"canal" "canal_cita" DEFAULT 'web' NOT NULL,
	"modalidad_pago" "modalidad_pago" DEFAULT 'clinica' NOT NULL,
	"precio" integer NOT NULL,
	"sobrecupo" boolean DEFAULT false NOT NULL,
	"motivo_consulta" text,
	"requiere_revision" boolean DEFAULT false NOT NULL,
	"reserva_expira_en" timestamp with time zone,
	"cancelada_en" timestamp with time zone,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnosticos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"codigo_cie10" text,
	"descripcion" text NOT NULL,
	"tipo" "tipo_diagnostico" DEFAULT 'principal' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "especialidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"descripcion" text,
	"duracion_minutos" smallint DEFAULT 30 NOT NULL,
	"precio" integer NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "especialidades_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fichas_clinicas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"grupo_sanguineo" text,
	"alergias" text,
	"enfermedades_cronicas" text,
	"medicamentos_habituales" text,
	"antecedentes_quirurgicos" text,
	"antecedentes_familiares" text,
	"habitos" text,
	"observaciones" text,
	"actualizado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fichas_clinicas_paciente_id_unique" UNIQUE("paciente_id")
);
--> statement-breakpoint
CREATE TABLE "horarios_medico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medico_id" uuid NOT NULL,
	"especialidad_id" uuid,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	"duracion_minutos" smallint DEFAULT 30 NOT NULL,
	"vigente_desde" date DEFAULT now() NOT NULL,
	"vigente_hasta" date
);
--> statement-breakpoint
CREATE TABLE "lista_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"especialidad_id" uuid NOT NULL,
	"medico_id" uuid,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"estado" "estado_lista_espera" DEFAULT 'activa' NOT NULL,
	"notificada_en" timestamp with time zone,
	"cita_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medico_especialidades" (
	"medico_id" uuid NOT NULL,
	"especialidad_id" uuid NOT NULL,
	CONSTRAINT "medico_especialidades_medico_id_especialidad_id_pk" PRIMARY KEY("medico_id","especialidad_id")
);
--> statement-breakpoint
CREATE TABLE "medicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"rut" text NOT NULL,
	"nombres" text NOT NULL,
	"apellidos" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"registro_sis" text,
	"biografia" text,
	"atiende_fonasa" boolean DEFAULT true NOT NULL,
	"foto_url" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicos_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "medicos_rut_unique" UNIQUE("rut")
);
--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cita_id" uuid,
	"paciente_id" uuid NOT NULL,
	"canal" "canal_notificacion" NOT NULL,
	"tipo" "tipo_notificacion" NOT NULL,
	"estado" "estado_notificacion" DEFAULT 'pendiente' NOT NULL,
	"programada_para" timestamp with time zone NOT NULL,
	"enviada_en" timestamp with time zone,
	"intentos" smallint DEFAULT 0 NOT NULL,
	"error" text,
	"id_externo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pacientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_id" uuid,
	"user_id" text,
	"rut" text NOT NULL,
	"nombres" text NOT NULL,
	"apellidos" text NOT NULL,
	"fecha_nacimiento" date,
	"sexo" text,
	"email" text,
	"telefono" text,
	"prevision" "prevision",
	"isapre" text,
	"direccion" text,
	"contacto_emergencia_nombre" text,
	"contacto_emergencia_telefono" text,
	"consentimiento_contacto_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pacientes_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "pacientes_rut_unique" UNIQUE("rut")
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cita_id" uuid NOT NULL,
	"medio" "medio_pago" NOT NULL,
	"estado" "estado_pago" DEFAULT 'pendiente' NOT NULL,
	"monto" integer NOT NULL,
	"referencia_externa" text,
	"registrado_por" text,
	"detalle" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "rol_usuario" DEFAULT 'paciente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_subido_por_user_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_ficha_id_fichas_clinicas_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."fichas_clinicas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosticos" ADD CONSTRAINT "diagnosticos_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_actualizado_por_user_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_medico" ADD CONSTRAINT "horarios_medico_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_medico" ADD CONSTRAINT "horarios_medico_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medico_especialidades" ADD CONSTRAINT "medico_especialidades_medico_id_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."medicos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medico_especialidades" ADD CONSTRAINT "medico_especialidades_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicos" ADD CONSTRAINT "medicos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_tutor_id_pacientes_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."pacientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_user_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "adjuntos_paciente_idx" ON "adjuntos" USING btree ("paciente_id");--> statement-breakpoint
CREATE INDEX "atenciones_ficha_fecha_idx" ON "atenciones" USING btree ("ficha_id","fecha");--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_user_idx" ON "auditoria" USING btree ("user_id","creado_en");--> statement-breakpoint
CREATE INDEX "bloqueos_medico_idx" ON "bloqueos_agenda" USING btree ("medico_id","inicio");--> statement-breakpoint
CREATE INDEX "citas_medico_inicio_idx" ON "citas" USING btree ("medico_id","inicio");--> statement-breakpoint
CREATE INDEX "citas_paciente_idx" ON "citas" USING btree ("paciente_id");--> statement-breakpoint
CREATE INDEX "citas_pendiente_pago_idx" ON "citas" USING btree ("reserva_expira_en") WHERE "citas"."estado" = 'pendiente_pago';--> statement-breakpoint
CREATE INDEX "diagnosticos_atencion_idx" ON "diagnosticos" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "horarios_medico_idx" ON "horarios_medico" USING btree ("medico_id","dia_semana");--> statement-breakpoint
CREATE INDEX "lista_espera_activa_idx" ON "lista_espera" USING btree ("especialidad_id","creado_en") WHERE "lista_espera"."estado" = 'activa';--> statement-breakpoint
CREATE UNIQUE INDEX "notificaciones_unica_idx" ON "notificaciones" USING btree ("cita_id","canal","tipo");--> statement-breakpoint
CREATE INDEX "notificaciones_pendientes_idx" ON "notificaciones" USING btree ("programada_para") WHERE "notificaciones"."estado" = 'pendiente';--> statement-breakpoint
CREATE INDEX "pagos_cita_idx" ON "pagos" USING btree ("cita_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_referencia_idx" ON "pagos" USING btree ("medio","referencia_externa");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");