ALTER TYPE "public"."estado_notificacion" ADD VALUE 'procesando' BEFORE 'enviada';--> statement-breakpoint
ALTER TYPE "public"."estado_notificacion" ADD VALUE 'omitida';--> statement-breakpoint
ALTER TABLE "notificaciones" ADD COLUMN "bloqueada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD COLUMN "destino" text;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD COLUMN "asunto" text;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD COLUMN "cuerpo" text;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "pagado_en" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "pagos_pagado_en_idx" ON "pagos" USING btree ("pagado_en");