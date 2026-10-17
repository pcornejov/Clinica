import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { pacientes, user, type prevision } from "~/db/schema";

type Prevision = (typeof prevision.enumValues)[number];

export type DatosPersona = {
  rut: string;
  nombres: string;
  apellidos: string;
  email?: string | null;
  telefono?: string | null;
  prevision?: Prevision | null;
  fechaNacimiento?: string | null;
};

export type Paciente = typeof pacientes.$inferSelect;

/**
 * Busca un paciente por RUT o lo crea.
 *
 * Regla de seguridad: si el RUT ya existe, NUNCA se sobrescriben sus datos con
 * lo que escribió quien reserva (podría ser otra persona). Solo se completan
 * datos de contacto que falten. Si el contacto ingresado no coincide con el
 * registrado, se marca para revisión de recepción.
 */
export async function obtenerOCrearPaciente(
  db: Db,
  datos: DatosPersona,
  opciones: { tutorId?: string; consentimiento?: boolean } = {},
): Promise<{ paciente: Paciente; creado: boolean; requiereRevision: boolean }> {
  const [existente] = await db.select().from(pacientes).where(eq(pacientes.rut, datos.rut));

  if (existente) {
    const difiere = (registrado: string | null, ingresado?: string | null) =>
      !!registrado && !!ingresado && registrado.toLowerCase() !== ingresado.toLowerCase();
    const requiereRevision =
      difiere(existente.email, datos.email) ||
      difiere(existente.telefono, datos.telefono) ||
      (!!opciones.tutorId && !!existente.tutorId && existente.tutorId !== opciones.tutorId);

    const completar: Partial<typeof pacientes.$inferInsert> = {};
    if (!existente.email && datos.email) completar.email = datos.email;
    if (!existente.telefono && datos.telefono) completar.telefono = datos.telefono;
    if (!existente.prevision && datos.prevision) completar.prevision = datos.prevision;
    if (!existente.tutorId && opciones.tutorId && !existente.userId) completar.tutorId = opciones.tutorId;
    if (!existente.consentimientoContactoEn && opciones.consentimiento) completar.consentimientoContactoEn = new Date();

    if (Object.keys(completar).length > 0) {
      const [actualizado] = await db.update(pacientes).set(completar).where(eq(pacientes.id, existente.id)).returning();
      return { paciente: actualizado, creado: false, requiereRevision };
    }
    return { paciente: existente, creado: false, requiereRevision };
  }

  const [nuevo] = await db
    .insert(pacientes)
    .values({
      rut: datos.rut,
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      email: datos.email ?? null,
      telefono: datos.telefono ?? null,
      prevision: datos.prevision ?? null,
      fechaNacimiento: datos.fechaNacimiento ?? null,
      tutorId: opciones.tutorId ?? null,
      consentimientoContactoEn: opciones.consentimiento ? new Date() : null,
    })
    .onConflictDoNothing({ target: pacientes.rut })
    .returning();

  // Otra petición creó el mismo RUT al mismo tiempo: se usa ese registro.
  if (!nuevo) return obtenerOCrearPaciente(db, datos, opciones);
  return { paciente: nuevo, creado: true, requiereRevision: false };
}

/**
 * Crea la cuenta del paciente (sin contraseña: ingresa con un código enviado a
 * su correo) y la vincula. Usa el correo REGISTRADO del paciente, nunca uno
 * recién escrito, para que nadie pueda apropiarse de la cuenta de otro.
 */
export async function asegurarCuentaPaciente(db: Db, paciente: Paciente): Promise<void> {
  if (paciente.userId || !paciente.email) return;
  const email = paciente.email.toLowerCase();

  let [cuenta] = await db.select().from(user).where(eq(user.email, email));
  if (!cuenta) {
    [cuenta] = await db
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        name: `${paciente.nombres} ${paciente.apellidos}`,
        email,
        role: "paciente",
      })
      .onConflictDoNothing({ target: user.email })
      .returning();
    if (!cuenta) [cuenta] = await db.select().from(user).where(eq(user.email, email));
  }
  if (cuenta.role !== "paciente") return;

  const [yaVinculado] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.userId, cuenta.id));
  if (yaVinculado) return;
  await db.update(pacientes).set({ userId: cuenta.id }).where(eq(pacientes.id, paciente.id));
}
