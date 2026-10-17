/**
 * Importa el catálogo CIE-10 completo desde un CSV (por ejemplo, el publicado
 * por el DEIS-MINSAL). Columnas esperadas: código;descripción (separador ; o ,).
 *
 * Uso: npm run db:cie10 -- ruta/al/archivo.csv
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { crearDb } from "../app/db/client";
import { normalizarBusqueda } from "../app/db/cie10-basico";
import { cie10 } from "../app/db/schema";

config({ path: [".dev.vars", ".env"], quiet: true });

const ruta = process.argv[2];
if (!ruta) throw new Error("Indica la ruta del CSV: npm run db:cie10 -- archivo.csv");
const { db, cerrar } = crearDb(process.env.DATABASE_URL!);

const filas = readFileSync(ruta, "utf8")
  .split(/\r?\n/)
  .map((linea) => linea.split(/[;,](.*)/s).map((c) => c?.trim().replace(/^"|"$/g, "")))
  .filter(([codigo, descripcion]) => codigo && descripcion && /^[A-Z]\d{2}(\.\d{1,2})?$/.test(codigo));

for (let i = 0; i < filas.length; i += 500) {
  await db
    .insert(cie10)
    .values(filas.slice(i, i + 500).map(([codigo, descripcion]) => ({ codigo, descripcion, busqueda: normalizarBusqueda(`${codigo} ${descripcion}`) })))
    .onConflictDoUpdate({ target: cie10.codigo, set: { descripcion: cie10.descripcion } });
}
console.log(`✔ ${filas.length} códigos CIE-10 importados`);
await cerrar();
