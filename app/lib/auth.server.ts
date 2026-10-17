import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "~/db/client";
import { account, session, user, verification, type RolUsuario } from "~/db/schema";
import { hashPassword, verifyPassword } from "./password";

export type Rol = RolUsuario;

export function crearAuth(env: Env, db: Db) {
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      // Las cuentas del personal las crea el administrador; las de pacientes
      // se crean al agendar (Fase 2).
      disableSignUp: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "paciente", input: false },
      },
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
    },
  });
}

export type Auth = ReturnType<typeof crearAuth>;
