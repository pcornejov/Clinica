-- Los diagnósticos de una atención firmada tampoco se pueden agregar, cambiar
-- ni borrar (complementa el trigger "atenciones_inmutables").
CREATE FUNCTION diagnosticos_inmutables() RETURNS trigger AS $$
DECLARE
  estado_atencion text;
BEGIN
  SELECT estado INTO estado_atencion FROM atenciones
    WHERE id = COALESCE(NEW.atencion_id, OLD.atencion_id);
  IF estado_atencion = 'firmada' THEN
    RAISE EXCEPTION 'La atención está firmada: sus diagnósticos no se pueden modificar';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER diagnosticos_inmutables
  BEFORE INSERT OR UPDATE OR DELETE ON "diagnosticos"
  FOR EACH ROW EXECUTE FUNCTION diagnosticos_inmutables();
