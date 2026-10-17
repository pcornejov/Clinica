import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Neon se usa por HTTP (sin conexiones persistentes, ideal para Workers).
 * Cualquier otro Postgres (desarrollo local) se usa con una conexión TCP
 * que hay que cerrar al terminar la petición.
 */
export function crearDb(url: string): { db: Db; cerrar: () => Promise<void> } {
  if (new URL(url).hostname.endsWith(".neon.tech")) {
    return { db: drizzleNeon(neon(url), { schema }) as unknown as Db, cerrar: async () => {} };
  }
  const cliente = postgres(url, { max: 1, prepare: false });
  return {
    db: drizzlePostgres(cliente, { schema }) as unknown as Db,
    cerrar: () => cliente.end({ timeout: 5 }),
  };
}
