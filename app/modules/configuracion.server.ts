import { aplicarConfig } from "~/config/clinica";
import { esquemaGuardado, type ConfigGuardada } from "~/config/esquema";
import type { Db } from "~/db/client";
import { configuracionClinica } from "~/db/schema";

/** Cada cuánto cada instancia del Worker vuelve a leer la configuración guardada. */
const VIGENCIA_MS = 30_000;
let cargadaEn = 0;

async function leerGuardada(db: Db): Promise<ConfigGuardada> {
  const [fila] = await db.select().from(configuracionClinica).limit(1);
  if (!fila) return {};
  const lectura = esquemaGuardado.safeParse(fila.datos);
  if (!lectura.success) {
    console.error("Configuración guardada no válida; se usan los valores por defecto", lectura.error.issues);
    return {};
  }
  return lectura.data;
}

/**
 * Deja vigente la configuración guardada. Se llama al inicio de cada petición
 * y del cron; lee la base de datos como máximo cada 30 segundos por instancia.
 * Si la lectura falla (p. ej. la migración aún no se aplicó) se siguen usando
 * los valores por defecto, sin tumbar la petición.
 */
export async function cargarConfig(db: Db, forzar = false): Promise<void> {
  if (!forzar && Date.now() - cargadaEn < VIGENCIA_MS) return;
  cargadaEn = Date.now();
  try {
    aplicarConfig(await leerGuardada(db));
  } catch (error) {
    console.error("No se pudo leer la configuración de la clínica", error);
  }
}

/** Guarda cambios (parciales) sobre lo ya guardado y los deja vigentes de inmediato. */
export async function guardarConfig(db: Db, usuarioId: string, cambios: ConfigGuardada): Promise<void> {
  const actual = await leerGuardada(db);
  const nueva: ConfigGuardada = {
    ...actual,
    ...cambios,
    modulos: { ...actual.modulos, ...cambios.modulos },
    reglas: { ...actual.reglas, ...cambios.reglas },
  };
  await db
    .insert(configuracionClinica)
    .values({ id: 1, datos: nueva, actualizadoPor: usuarioId })
    .onConflictDoUpdate({
      target: configuracionClinica.id,
      set: { datos: nueva, actualizadoPor: usuarioId, actualizadoEn: new Date() },
    });
  aplicarConfig(nueva);
  cargadaEn = Date.now();
}
