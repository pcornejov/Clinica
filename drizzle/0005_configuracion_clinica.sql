CREATE TABLE "configuracion_clinica" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"datos" jsonb NOT NULL,
	"actualizado_por" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracion_clinica_unica" CHECK ("configuracion_clinica"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "configuracion_clinica" ADD CONSTRAINT "configuracion_clinica_actualizado_por_user_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;