CREATE TABLE "conversaciones_whatsapp" (
	"telefono" text PRIMARY KEY NOT NULL,
	"paso" text NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensajes_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_simulados" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"telefono" text NOT NULL,
	"contenido" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_simulados_telefono_idx" ON "whatsapp_simulados" USING btree ("telefono","id");