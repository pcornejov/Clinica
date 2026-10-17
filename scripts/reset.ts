/**
 * Borra TODAS las tablas de la base de datos. Solo para desarrollo local.
 * Uso: npm run db:reset   (luego aplica migraciones y carga los datos demo)
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".dev.vars", ".env"], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL (en .dev.vars o .env)");

const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1"].includes(host) && !process.argv.includes("--forzar")) {
  console.error(`Se negó a borrar la base de datos en "${host}". Usa --forzar si estás seguro.`);
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql`DROP SCHEMA IF EXISTS public CASCADE`;
await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
await sql`CREATE SCHEMA public`;
await sql.end();
console.log(`✔ Base de datos en ${host} vaciada`);
