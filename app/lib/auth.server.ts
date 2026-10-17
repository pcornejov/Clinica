import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import type { Db } from "~/db/client";
import { account, session, user, verification, type RolUsuario } from "~/db/schema";
import { clinica } from "~/config/clinica";
import { enviarEmail } from "~/modules/avisos/envio.server";
import { hashPassword, verifyPassword } from "./password";

export type Rol = RolUsuario;

/**
 * Mientras no exista el envío de correos (Fase 4), el código para ingresar
 * se escribe en el log y, en modo demo, se muestra en pantalla.
 */
export type BuzonDemo = { ultimoCodigo?: string };

export function crearAuth(env: Env, db: Db, buzon: BuzonDemo = {}) {
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
    plugins: [
      // Pacientes: ingresan con un código de 6 dígitos enviado a su correo.
      emailOTP({
        disableSignUp: true,
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        async sendVerificationOTP({ email, otp }) {
          if (env.MOSTRAR_CODIGOS_DEMO === "true") buzon.ultimoCodigo = otp;
          const texto = `Tu código para ingresar a ${clinica.nombre} es ${otp}. Vence en 10 minutos. Si no lo pediste, ignora este correo.`;
          try {
            const r = await enviarEmail(env, {
              para: email,
              asunto: `${otp} es tu código de ingreso`,
              texto,
              html: `<p style="font-family:Arial,sans-serif">Tu código para ingresar a ${clinica.nombre} es:</p><p style="font-family:Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p><p style="font-family:Arial,sans-serif;color:#64748b">Vence en 10 minutos. Si no lo pediste, ignora este correo.</p>`,
            });
            if (r.simulado) console.log(`[código de ingreso simulado] ${email}: ${otp}`);
          } catch (error) {
            console.error("No se pudo enviar el código de ingreso", error);
          }
        },
      }),
    ],
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
    },
  });
}

export type Auth = ReturnType<typeof crearAuth>;
