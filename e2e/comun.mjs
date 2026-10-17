// Utilidades compartidas de las pruebas de punta a punta.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

/** Lee DATABASE_URL desde .dev.vars si no viene en el entorno. */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const linea = readFileSync(".dev.vars", "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    if (linea) return linea.slice("DATABASE_URL=".length).trim();
  } catch {}
  return "postgresql://postgres:postgres@localhost:5432/clinica";
}

/** URL de la app (por defecto, `vite preview` en el puerto 4173). */
export const B = process.env.E2E_URL ?? "http://localhost:4173";

/** Consulta SQL síncrona con psql (requiere psql instalado). */
const URL_DB = databaseUrl();
export const sql = (q) => execSync(`psql "${URL_DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();

/** Chromium: el que instala `npx playwright-core install chromium`, o CHROMIUM_PATH. */
export const lanzar = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

const CAPTURAS = join("e2e", "capturas");
mkdirSync(CAPTURAS, { recursive: true });
/** Ruta para guardar una captura de pantalla (carpeta ignorada por git). */
export const captura = (nombre) => join(CAPTURAS, nombre);

/** Ruta en la carpeta temporal del sistema (archivos de prueba). */
export const temporal = (nombre) => join(tmpdir(), nombre);
