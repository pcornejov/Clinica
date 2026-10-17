import { z } from "zod";

export type Errores = Record<string, string>;

/** Valida un FormData con Zod; los campos de `multiples` siempre llegan como arreglo. */
export function validar<T extends z.ZodType>(
  esquema: T,
  formData: FormData,
  multiples: string[] = [],
): { ok: true; datos: z.output<T> } | { ok: false; errores: Errores } {
  const crudo: Record<string, unknown> = {};
  for (const clave of new Set(formData.keys())) {
    const valores = formData.getAll(clave);
    crudo[clave] = multiples.includes(clave) ? valores : valores[0];
  }
  for (const clave of multiples) crudo[clave] ??= [];

  const resultado = esquema.safeParse(crudo);
  if (resultado.success) return { ok: true, datos: resultado.data };

  const errores: Errores = {};
  for (const problema of resultado.error.issues) {
    const clave = String(problema.path[0] ?? "_");
    errores[clave] ??= problema.message;
  }
  return { ok: false, errores };
}

/** Texto opcional: vacío se guarda como null. */
export const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((valor) => valor || null);

export const casilla = z
  .string()
  .optional()
  .transform((valor) => valor === "on");

/** Detecta una violación de restricción única de Postgres (código 23505). */
export function esViolacionUnica(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
