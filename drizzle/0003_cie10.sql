CREATE TABLE "cie10" (
	"codigo" text PRIMARY KEY NOT NULL,
	"descripcion" text NOT NULL,
	"busqueda" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cie10_busqueda_idx" ON "cie10" USING btree ("busqueda");