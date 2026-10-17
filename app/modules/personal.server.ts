import { and, eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { account, session, user, type RolUsuario } from "~/db/schema";
import { hashPassword } from "~/lib/password";

/** Crea un usuario con contraseña (personal de la clínica). Devuelve su id. */
export async function crearUsuarioPersonal(
  db: Db,
  datos: { nombre: string; email: string; rol: RolUsuario; password: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const hash = await hashPassword(datos.password);
  await db.insert(user).values({
    id,
    name: datos.nombre,
    email: datos.email.toLowerCase(),
    role: datos.rol,
    emailVerified: true,
  });
  try {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });
  } catch (error) {
    await db.delete(user).where(eq(user.id, id));
    throw error;
  }
  return id;
}

/** Cambia la contraseña y cierra las sesiones abiertas del usuario. */
export async function cambiarClave(db: Db, userId: string, password: string) {
  const hash = await hashPassword(password);
  await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  await db.delete(session).where(eq(session.userId, userId));
}
