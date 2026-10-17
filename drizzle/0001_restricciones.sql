-- Reglas de integridad que Drizzle no puede expresar en el esquema.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Un médico no puede tener dos citas activas que se crucen en el tiempo.
-- Es la protección definitiva contra el doble agendamiento: aunque dos
-- personas reserven la misma hora al mismo tiempo, solo una lo logra.
ALTER TABLE "citas" ADD CONSTRAINT "citas_sin_superposicion"
  EXCLUDE USING gist (
    "medico_id" WITH =,
    tstzrange("inicio", "fin", '[)') WITH &&
  ) WHERE ("estado" NOT IN ('cancelada', 'no_asistio'));
--> statement-breakpoint

ALTER TABLE "citas" ADD CONSTRAINT "citas_rango_valido" CHECK ("fin" > "inicio");
--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_precio_valido" CHECK ("precio" >= 0);
--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_rango_valido" CHECK ("fin" > "inicio");
--> statement-breakpoint
ALTER TABLE "horarios_medico" ADD CONSTRAINT "horarios_dia_valido" CHECK ("dia_semana" BETWEEN 0 AND 6);
--> statement-breakpoint
ALTER TABLE "horarios_medico" ADD CONSTRAINT "horarios_rango_valido" CHECK ("hora_fin" > "hora_inicio");
--> statement-breakpoint
ALTER TABLE "horarios_medico" ADD CONSTRAINT "horarios_duracion_valida" CHECK ("duracion_minutos" > 0);
--> statement-breakpoint
ALTER TABLE "especialidades" ADD CONSTRAINT "especialidades_precio_valido" CHECK ("precio" >= 0);
--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto_valido" CHECK ("monto" >= 0);
--> statement-breakpoint

-- Una atención firmada no se puede modificar ni borrar (Ley 20.584):
-- las correcciones se registran como una nueva atención con "corrige_a".
CREATE FUNCTION atenciones_inmutables() RETURNS trigger AS $$
BEGIN
  IF OLD.estado = 'firmada' THEN
    RAISE EXCEPTION 'La atención % está firmada y no se puede modificar', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER atenciones_inmutables
  BEFORE UPDATE OR DELETE ON "atenciones"
  FOR EACH ROW EXECUTE FUNCTION atenciones_inmutables();
--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_corrige_a_fk"
  FOREIGN KEY ("corrige_a") REFERENCES "atenciones"("id");
--> statement-breakpoint

-- El registro de auditoría solo admite inserciones.
CREATE FUNCTION auditoria_solo_insercion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de auditoría no se puede modificar';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER auditoria_solo_insercion
  BEFORE UPDATE OR DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_solo_insercion();
